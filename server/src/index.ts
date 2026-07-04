import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { SerperService } from './services/serper';
import { CrawlerService } from './services/crawler';
import { AIService } from './services/ai';
import { PDFService } from './services/pdf';
import { DiscordService } from './services/discord';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Expose temp directory for PDF storage
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Healthcheck endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('AI Company Research Assistant Server is running!');
});

// Download PDF endpoint
app.get('/api/pdf/:filename', (req, res) => {
  const filePath = path.join(tempDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'PDF report not found.' });
  }
});

// Send research results to Discord endpoint
app.post('/api/discord', async (req, res) => {
  const {
    botToken,
    channelId,
    applicantName,
    applicantEmail,
    companyName,
    websiteUrl,
    pdfFilename,
  } = req.body;

  if (!botToken || !channelId) {
    return res.status(400).json({ error: 'Bot Token and Channel ID are required.' });
  }

  const pdfPath = path.join(tempDir, pdfFilename);
  if (!fs.existsSync(pdfPath)) {
    return res.status(400).json({ error: `PDF file ${pdfFilename} does not exist on the server.` });
  }

  const discordService = new DiscordService();
  try {
    await discordService.sendReport({
      botToken,
      channelId,
      applicantName,
      applicantEmail,
      companyName,
      websiteUrl,
      pdfPath,
    });
    res.json({ success: true, message: 'Report successfully sent to Discord!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Research endpoint (handles streaming progress steps)
app.post('/api/research', async (req, res) => {
  const { query } = req.body;
  let model = req.body.model;
  if (!model || model === 'meta-llama/llama-3-8b-instruct:free') {
    model = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  }
  
  // Accept API keys from headers or fallback to environment variables
  const serperKey = (req.headers['x-serper-key'] as string) || process.env.SERPER_API_KEY || '';
  const openrouterKey = (req.headers['x-openrouter-key'] as string) || process.env.OPENROUTER_API_KEY || '';

  if (!query) {
    return res.status(400).json({ error: 'Research query (company name or URL) is required.' });
  }

  // Set headers for streaming Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx if any

  const sendProgress = (step: string, message: string, data?: any) => {
    res.write(`data: ${JSON.stringify({ step, message, data })}\n\n`);
  };

  try {
    const serperService = new SerperService(serperKey);
    const crawlerService = new CrawlerService(5); // Crawl up to 5 pages
    const aiService = new AIService(openrouterKey, model);
    const pdfService = new PDFService();

    let targetWebsite = '';
    let companyName = query;

    // Detect if input is a URL
    const isUrl = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/i.test(query);

    if (isUrl) {
      targetWebsite = query;
      // Extract a plausible company name from the URL
      try {
        let cleanUrl = query;
        if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;
        const parsedUrl = new URL(cleanUrl);
        companyName = parsedUrl.hostname.replace('www.', '').split('.')[0];
        // Capitalize company name
        companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
      } catch (e) {
        companyName = query;
      }
      sendProgress('website_discovery', `Input is a direct website URL. Proceeding with ${targetWebsite}...`);
    } else {
      sendProgress('website_discovery', `Searching website for "${query}"...`);
      try {
        targetWebsite = await serperService.findOfficialWebsite(query);
        sendProgress('website_discovery', `Found website for ${query}: ${targetWebsite}`);
      } catch (err: any) {
        sendProgress('website_discovery', `Website search failed, attempting direct crawl on predicted domains...`);
        // Fallback guess: query.com
        targetWebsite = `https://${query.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      }
    }

    // 2. Crawling Website Pages
    sendProgress('crawling', `Initializing website crawler...`);
    const crawlResult = await crawlerService.crawl(targetWebsite, (crawlMsg) => {
      sendProgress('crawling', crawlMsg);
    });

    // 3. Gathering Public Search Info
    sendProgress('public_search', `Searching public contact info and competitor listings...`);
    const contactInfo = await serperService.getContactDetails(companyName);
    const competitorSearchText = await serperService.searchCompetitors(companyName);
    sendProgress('public_search', `Public search completed. Contact phone: ${contactInfo.phone}, address: ${contactInfo.address}`);

    // 4. Generating AI Insights
    sendProgress('ai_analysis', `Analyzing collected information with AI model...`);
    const consolidatedSearchInfo = `Contact Phone: ${contactInfo.phone}\nContact Address: ${contactInfo.address}\n\nSearch Competitors Context:\n${competitorSearchText}`;
    
    const aiAnalysis = await aiService.analyzeCompany(
      companyName,
      crawlResult.consolidatedContent || `Company Name: ${companyName}\nWebsite: ${targetWebsite}`,
      consolidatedSearchInfo
    );
    sendProgress('ai_analysis', `AI Business analysis complete!`);

    // 5. Generating PDF Report
    sendProgress('pdf_generation', `Generating professional PDF report...`);
    
    // Ensure contact details are populated correctly in PDF
    const pdfData = {
      name: companyName,
      website: targetWebsite,
      phone: contactInfo.phone,
      address: contactInfo.address,
      companySummary: aiAnalysis.companySummary,
      products: aiAnalysis.products,
      painPoints: aiAnalysis.painPoints,
      competitors: aiAnalysis.competitors,
    };

    const pdfPath = await pdfService.generateReport(pdfData);
    const pdfFilename = path.basename(pdfPath);
    sendProgress('pdf_generation', `PDF Report successfully created!`);

    // 6. Finish
    const finalReport = {
      companyName,
      website: targetWebsite,
      phone: contactInfo.phone,
      address: contactInfo.address,
      summary: aiAnalysis.companySummary,
      products: aiAnalysis.products,
      painPoints: aiAnalysis.painPoints,
      competitors: aiAnalysis.competitors,
      pdfFilename,
      pdfUrl: `/api/pdf/${pdfFilename}`,
    };

    sendProgress('completed', 'Research process finished successfully!', finalReport);
    res.end();

  } catch (error: any) {
    console.error('Research pipeline failed:', error);
    sendProgress('error', `Research failed: ${error.message}`);
    res.end();
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
