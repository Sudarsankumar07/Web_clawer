import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

interface CrawlResult {
  url: string;
  title: string;
  content: string;
}

export class CrawlerService {
  private maxPages: number;

  constructor(maxPages = 6) {
    this.maxPages = maxPages;
  }

  /**
   * Crawls a website starting from the base URL and extracts content from important subpages.
   * Calls the progress callback as it makes progress.
   */
  async crawl(
    startUrl: string,
    onProgress?: (message: string) => void
  ): Promise<{ crawledPages: CrawlResult[]; consolidatedContent: string }> {
    let normalizedStartUrl = startUrl;
    if (!/^https?:\/\//i.test(normalizedStartUrl)) {
      normalizedStartUrl = 'https://' + normalizedStartUrl;
    }

    let startUri: URL;
    try {
      startUri = new URL(normalizedStartUrl);
    } catch (e) {
      throw new Error(`Invalid start URL: ${startUrl}`);
    }

    const targetHostname = startUri.hostname.replace('www.', '');
    const crawledUrls = new Set<string>();
    const urlQueue: string[] = [normalizedStartUrl];
    const results: CrawlResult[] = [];

    // Important page keywords
    const priorityKeywords = ['about', 'product', 'service', 'solution', 'pricing', 'contact', 'feature', 'platform'];
    // Ignored page keywords
    const ignoreKeywords = [
      'login', 'signin', 'signup', 'register', 'logout', 'careers', 'jobs', 'blog', 'privacy',
      'terms', 'cookie', 'legal', 'docs', 'help', 'support', 'faq', 'dashboard', 'account', 'cart', 'checkout'
    ];

    onProgress?.(`Starting crawl on ${startUri.origin}...`);

    while (urlQueue.length > 0 && crawledUrls.size < this.maxPages) {
      const currentUrl = urlQueue.shift()!;
      
      // Clean/normalize URL to prevent duplicates with trailing slashes or hashes
      const cleanUrl = currentUrl.split('#')[0].replace(/\/$/, '');
      if (crawledUrls.has(cleanUrl)) continue;
      
      crawledUrls.add(cleanUrl);
      onProgress?.(`Crawling [${crawledUrls.size}/${this.maxPages}]: ${cleanUrl}`);

      try {
        const response = await axios.get(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          timeout: 8000,
          maxRedirects: 5,
        });

        const contentType = String(response.headers['content-type'] || '');
        if (!contentType.includes('text/html')) {
          onProgress?.(`Skipping non-HTML page: ${currentUrl}`);
          continue;
        }

        const html = response.data;
        const $ = cheerio.load(html);

        // Get page Title
        const title = $('title').text().trim() || 'Untitled Page';

        // Extract internal links to queue
        const links: string[] = [];
        $('a[href]').each((_, element) => {
          const href = $(element).attr('href');
          if (!href) return;

          try {
            const absoluteUrl = new URL(href, currentUrl);
            const linkHostname = absoluteUrl.hostname.replace('www.', '');

            // Only crawl same domain/hostname
            if (linkHostname === targetHostname) {
              const linkPath = absoluteUrl.pathname.toLowerCase();
              
              // Skip if it contains any ignore keywords
              const shouldIgnore = ignoreKeywords.some(keyword => linkPath.includes(keyword) || href.toLowerCase().includes(keyword));
              if (shouldIgnore) return;

              // Clean url
              const normLink = absoluteUrl.toString().split('#')[0].replace(/\/$/, '');
              if (!crawledUrls.has(normLink) && !urlQueue.includes(normLink)) {
                links.push(normLink);
              }
            }
          } catch (e) {
            // Invalid URL in href
          }
        });

        // Sort links: priority pages go first
        links.sort((a, b) => {
          const aPriority = priorityKeywords.some(keyword => a.toLowerCase().includes(keyword)) ? 1 : 0;
          const bPriority = priorityKeywords.some(keyword => b.toLowerCase().includes(keyword)) ? 1 : 0;
          return bPriority - aPriority; // Descending
        });

        // Add top sorted links to queue
        urlQueue.push(...links.slice(0, 10));

        // Strip scripts, styles, navigation, footer and other non-content tags
        $('script, style, svg, img, nav, footer, header, noscript, iframe, link, .footer, .header, .nav, #footer, #header, #nav').remove();

        // Extract visible text
        let pageText = $('body').text();
        if (!pageText.trim()) {
          pageText = $.text(); // Fallback to overall text if body is empty/removed
        }

        // Clean whitespace
        const cleanedText = pageText
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, ' ')
          .trim();

        if (cleanedText.length > 100) {
          results.push({
            url: cleanUrl,
            title: title,
            content: cleanedText.substring(0, 10000), // Cap per page to 10k chars to save context window
          });
        }
      } catch (error: any) {
        onProgress?.(`Failed to crawl ${currentUrl}: ${error.message}`);
      }
    }

    onProgress?.(`Crawl completed. Crawled ${results.length} pages successfully.`);

    // Consolidate content
    const consolidated = results
      .map(page => `--- PAGE: ${page.title} (${page.url}) ---\n${page.content}`)
      .join('\n\n');

    return {
      crawledPages: results,
      consolidatedContent: consolidated,
    };
  }
}
