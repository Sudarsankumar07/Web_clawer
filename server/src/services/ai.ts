import axios from 'axios';

interface Competitor {
  name: string;
  url: string;
}

export interface ResearchAIResponse {
  companySummary: string;
  products: string[];
  painPoints: string[];
  competitors: Competitor[];
}

export class AIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    // Use deepseek-chat or gemini-2.5-flash as default, fallback to a reliable free model if not specified
    this.model = model || 'nvidia/nemotron-3-ultra-550b-a55b:free';
  }

  async analyzeCompany(
    companyName: string,
    crawledContent: string,
    publicSearchInfo: string
  ): Promise<ResearchAIResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API Key is missing. Please configure it in the settings panel.');
    }

    const systemPrompt = `You are a professional business research analyst. Your job is to analyze crawled website content and public search information for a company and return a clean, structured JSON report.
You must respond with ONLY a valid JSON object. Do not include any explanations, markdown boxes outside of JSON, or notes.
The JSON must follow this exact typescript interface:
{
  "companySummary": string, // 2-3 sentences summarizing what the company does, its main value proposition, and focus.
  "products": string[], // 3-8 key products, services, features, or tools offered by the company. Keep them concise.
  "painPoints": string[], // 3-5 specific business pain points, operational challenges, or market pain points this company faces or solves for its clients.
  "competitors": [ // A list of 3-4 key direct competitors or alternatives with their name and official URL (resolve full URLs, e.g. "https://comp.com")
    { "name": string, "url": string }
  ]
}`;

    const userPrompt = `Company to Analyze: ${companyName}

--- CRAWLED WEBSITE CONTENT ---
${crawledContent.substring(0, 15000)} // Cap to protect context limits

--- PUBLIC SEARCH INFORMATION ---
${publicSearchInfo}

Please perform the analysis and return the structured JSON object:`;

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' } // Enable JSON mode on OpenRouter
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://relu-consultancy.com', // Required by OpenRouter
            'X-Title': 'Relu Consultancy Research Assistant'
          },
          timeout: 45000 // 45 seconds timeout for heavy AI generation
        }
      );

      if (!response.data) {
        throw new Error('No response data received from OpenRouter API.');
      }
      if (response.data.error) {
        const errorDetails = response.data.error.message || JSON.stringify(response.data.error);
        throw new Error(`OpenRouter API returned error: ${errorDetails}`);
      }
      if (!response.data.choices || !Array.isArray(response.data.choices) || response.data.choices.length === 0) {
        throw new Error(`OpenRouter API response choices are empty/invalid. Response: ${JSON.stringify(response.data)}`);
      }
      const responseText = response.data.choices[0]?.message?.content?.trim();
      if (!responseText) {
        throw new Error('Empty response content received from OpenRouter API.');
      }

      // Robust parsing
      try {
        const parsed = JSON.parse(responseText) as ResearchAIResponse;
        // Basic validation & defaults
        return {
          companySummary: parsed.companySummary || 'No summary generated.',
          products: Array.isArray(parsed.products) ? parsed.products : [],
          painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : [],
          competitors: Array.isArray(parsed.competitors) ? parsed.competitors.map(c => ({
            name: c.name || 'Unknown Competitor',
            url: c.url || '#'
          })) : []
        };
      } catch (parseError) {
        console.error('Failed to parse JSON response directly:', responseText);
        // Try regex extraction of JSON if model ignored system prompt formatting instructions
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ResearchAIResponse;
          return {
            companySummary: parsed.companySummary || 'No summary generated.',
            products: Array.isArray(parsed.products) ? parsed.products : [],
            painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : [],
            competitors: Array.isArray(parsed.competitors) ? parsed.competitors.map(c => ({
              name: c.name || 'Unknown Competitor',
              url: c.url || '#'
            })) : []
          };
        }
        throw new Error('Response from AI was not valid JSON.');
      }

    } catch (error: any) {
      console.error('AIService analysis error:', error.response?.data || error.message);
      throw new Error(`AI Analysis failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}
