import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface PDFCompanyData {
  name: string;
  website: string;
  phone: string;
  address: string;
  companySummary: string;
  products: string[];
  painPoints: string[];
  competitors: { name: string; url: string }[];
}

export class PDFService {
  /**
   * Generates a professional PDF report and saves it to the temporary directory.
   * Returns the absolute path of the generated PDF.
   */
  async generateReport(data: PDFCompanyData): Promise<string> {
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_research_report.pdf`;
    const filePath = path.join(tempDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          bufferPages: true,
        });

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Header Banner Background
        doc.rect(0, 0, doc.page.width, 110).fill('#0f172a');

        // Header Text
        doc.fillColor('#eab308') // Gold
           .font('Helvetica-Bold')
           .fontSize(10)
           .text('RELU CONSULTANCY · COMPANY RESEARCH REPORT', 50, 40, { characterSpacing: 1 });

        doc.fillColor('#ffffff') // White title
           .font('Helvetica-Bold')
           .fontSize(32)
           .text(data.name, 50, 58);

        // Reset text writer cursor position below banner
        let currentY = 140;

        const drawSectionHeader = (title: string) => {
          doc.fillColor('#b45309') // Warm amber / brown-gold
             .font('Helvetica-Bold')
             .fontSize(12)
             .text(title, 50, currentY, { characterSpacing: 0.5 });
          
          currentY += 16;
          // Draw thin divider line
          doc.strokeColor('#e2e8f0')
             .lineWidth(1)
             .moveTo(50, currentY)
             .lineTo(doc.page.width - 50, currentY)
             .stroke();
          
          currentY += 12;
        };

        // --- SECTION 1: COMPANY INFORMATION ---
        drawSectionHeader('COMPANY INFORMATION');

        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10);
        
        // Render simple table key-values
        const renderRow = (label: string, value: string) => {
          doc.font('Helvetica-Bold').fillColor('#64748b').text(label, 50, currentY, { width: 100 });
          doc.font('Helvetica').fillColor('#1e293b').text(value, 150, currentY, { width: doc.page.width - 200 });
          
          const valueHeight = doc.heightOfString(value, { width: doc.page.width - 200 });
          currentY += Math.max(18, valueHeight + 6);
        };

        renderRow('Website', data.website);
        renderRow('Phone', data.phone || 'Not publicly listed');
        renderRow('Address', data.address || 'Not publicly listed');

        currentY += 10;

        // --- SECTION 2: COMPANY SUMMARY (AI Insights) ---
        if (data.companySummary) {
          drawSectionHeader('EXECUTIVE SUMMARY');
          doc.font('Helvetica').fontSize(10).fillColor('#334155').text(data.companySummary, 50, currentY, {
            lineGap: 4,
            width: doc.page.width - 100,
            align: 'justify'
          });
          const summaryHeight = doc.heightOfString(data.companySummary, { width: doc.page.width - 100, lineGap: 4 });
          currentY += summaryHeight + 25;
        }

        // Check if page overflow is close, add a new page if necessary
        const checkPageOverflow = (neededHeight: number) => {
          if (currentY + neededHeight > doc.page.height - 70) {
            doc.addPage();
            currentY = 50;
          }
        };

        // --- SECTION 3: PRODUCTS & SERVICES ---
        if (data.products && data.products.length > 0) {
          checkPageOverflow(100);
          drawSectionHeader('PRODUCTS & SERVICES');
          
          doc.font('Helvetica').fontSize(10).fillColor('#334155');
          data.products.forEach(product => {
            const bulletText = `• ${product}`;
            const textHeight = doc.heightOfString(bulletText, { width: doc.page.width - 100, lineGap: 2 });
            checkPageOverflow(textHeight + 5);
            
            doc.text(bulletText, 50, currentY, { width: doc.page.width - 100, lineGap: 2 });
            currentY += textHeight + 5;
          });
          currentY += 15;
        }

        // --- SECTION 4: AI-GENERATED PAIN POINTS ---
        if (data.painPoints && data.painPoints.length > 0) {
          checkPageOverflow(100);
          drawSectionHeader('AI-GENERATED PAIN POINTS');
          
          doc.font('Helvetica').fontSize(10).fillColor('#334155');
          data.painPoints.forEach(point => {
            const bulletText = `• ${point}`;
            const textHeight = doc.heightOfString(bulletText, { width: doc.page.width - 100, lineGap: 3 });
            checkPageOverflow(textHeight + 5);

            doc.text(bulletText, 50, currentY, { width: doc.page.width - 100, lineGap: 3 });
            currentY += textHeight + 6;
          });
          currentY += 15;
        }

        // --- SECTION 5: COMPETITORS ---
        if (data.competitors && data.competitors.length > 0) {
          checkPageOverflow(120);
          drawSectionHeader('COMPETITORS');

          data.competitors.forEach(comp => {
            checkPageOverflow(25);
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text(comp.name, 50, currentY, { width: 150 });
            doc.font('Helvetica').fontSize(10).fillColor('#2563eb').text(comp.url, 200, currentY, { width: doc.page.width - 250 });
            
            currentY += 20;
          });
        }

        // Page Numbers footer
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fillColor('#94a3b8')
             .font('Helvetica')
             .fontSize(8)
             .text(
               `Page ${i + 1} of ${pages.count}`,
               50,
               doc.page.height - 40,
               { align: 'center', width: doc.page.width - 100 }
             );
        }

        doc.end();

        writeStream.on('finish', () => {
          resolve(filePath);
        });

        writeStream.on('error', (err) => {
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }
}
