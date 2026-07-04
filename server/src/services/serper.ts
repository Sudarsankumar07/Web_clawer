import axios from 'axios';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperSearchResponse {
  organic: SerperResult[];
  answerBox?: {
    answer?: string;
    snippet?: string;
  };
  knowledgeGraph?: {
    title?: string;
    type?: string;
    description?: string;
    attributes?: Record<string, string>;
  };
}

export class SerperService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SERPER_API_KEY || '';
  }

  private get headers() {
    return {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Discovers the official website for a company name
   */
  async findOfficialWebsite(companyName: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Serper API Key is missing. Please configure it in the settings panel.');
    }

    try {
      const response = await axios.post<SerperSearchResponse>(
        'https://google.serper.dev/search',
        { q: `${companyName} official website` },
        { headers: this.headers }
      );

      const organic = response.data.organic;
      if (organic && organic.length > 0) {
        // Return first organic result link
        return organic[0].link;
      }
      throw new Error(`Could not find website for company: ${companyName}`);
    } catch (error: any) {
      console.error('Serper website discovery error:', error.message);
      throw new Error(`Failed to search official website: ${error.message}`);
    }
  }

  /**
   * Searches for public contact details (phone & address)
   */
  async getContactDetails(companyName: string): Promise<{ phone: string; address: string }> {
    if (!this.apiKey) {
      return { phone: 'Not publicly listed', address: 'Not publicly listed' };
    }

    let phone = 'Not publicly listed';
    let address = 'Not publicly listed';

    try {
      // 1. Search for phone
      const phoneRes = await axios.post<SerperSearchResponse>(
        'https://google.serper.dev/search',
        { q: `${companyName} headquarters contact phone number` },
        { headers: this.headers }
      );

      if (phoneRes.data.answerBox?.answer) {
        phone = phoneRes.data.answerBox.answer;
      } else if (phoneRes.data.answerBox?.snippet) {
        phone = phoneRes.data.answerBox.snippet;
      } else if (phoneRes.data.organic && phoneRes.data.organic.length > 0) {
        // Look for phone patterns in organic snippets
        const text = phoneRes.data.organic.slice(0, 3).map(o => o.snippet).join(' ');
        const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch) phone = phoneMatch[0];
      }

      // 2. Search for address
      const addressRes = await axios.post<SerperSearchResponse>(
        'https://google.serper.dev/search',
        { q: `${companyName} headquarters address location` },
        { headers: this.headers }
      );

      if (addressRes.data.answerBox?.answer) {
        address = addressRes.data.answerBox.answer;
      } else if (addressRes.data.answerBox?.snippet) {
        address = addressRes.data.answerBox.snippet;
      } else if (addressRes.data.knowledgeGraph?.attributes?.Address) {
        address = addressRes.data.knowledgeGraph.attributes.Address;
      } else if (addressRes.data.organic && addressRes.data.organic.length > 0) {
        address = addressRes.data.organic[0].snippet;
      }

    } catch (error: any) {
      console.error('Serper search details error:', error.message);
    }

    return { phone, address };
  }

  /**
   * Searches for list of competitors to feed into AI
   */
  async searchCompetitors(companyName: string): Promise<string> {
    if (!this.apiKey) return '';

    try {
      const response = await axios.post<SerperSearchResponse>(
        'https://google.serper.dev/search',
        { q: `${companyName} main competitors and market alternatives` },
        { headers: this.headers }
      );

      const organic = response.data.organic || [];
      return organic.slice(0, 5).map(o => `${o.title}: ${o.snippet}`).join('\n');
    } catch (error: any) {
      console.error('Serper search competitors error:', error.message);
      return '';
    }
  }
}
