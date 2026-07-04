# AI Company Research Assistant 🚀

A professional, full-stack business intelligence agent that researches any company using its name or website URL. The system automatically crawls the company's official pages, gathers public contact details/competitors using search APIs, analyzes the consolidated info using LLMs via OpenRouter, generates a downloadable PDF report, and forwards it to a Discord channel.

---

## 🔗 Live Deployments

*   **Production Frontend (Vercel):** [https://web-clawer.vercel.app/](https://web-clawer.vercel.app/)
*   **Production Backend API (Render):** [https://web-clawer.onrender.com/](https://web-clawer.onrender.com/)

---

## 🛠️ Tech Stack

*   **Frontend**: React (Vite), TypeScript, Tailwind CSS v4, Lucide React (Icons)
*   **Backend**: Node.js, Express, TypeScript, Axios, Cheerio (Scraping), PDFKit (A4 PDF Generation)
*   **Services**:
    *   **Serper.dev API**: High-performance Google Search extraction for resolving company URLs, matching contact info, and indexing competitors.
    *   **OpenRouter API**: Access to LLMs (with free models like `nvidia/nemotron-3-ultra-550b-a55b:free` or auto-fallback routers) for structured business summaries, product categorization, and market pain points.
    *   **Discord Webhook / Bot API**: Automates delivery of applicant details and PDF files into Discord channels.

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the project root (and configure these keys in your Render/Vercel settings panels):

```env
# 1. Search Lookup (Required for finding official URLs & details)
# Get your Serper API Key at: https://serper.dev
SERPER_API_KEY=your_serper_api_key_here

# 2. AI Intelligence (Required for generating insights)
# Get your OpenRouter API Key at: https://openrouter.ai
OPENROUTER_API_KEY=your_openrouter_api_key_here

# 3. Discord Bot Integration (Optional)
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here

# 4. Local Server Port Configuration
PORT=3000
```

---

## 🚀 Setup & Installation Instructions

### 1. Prerequisites
Ensure you have **Node.js (v18+)** and `npm` installed.

### 2. Install Dependencies
Run the following commands from the workspace root to install all package dependencies:
```bash
npm install
npm run install:all
```

### 3. Run Development Servers
To start the Vite client and the Express backend concurrently:
```bash
npm run dev
```
*   **Client**: [http://localhost:3001](http://localhost:3001)
*   **Backend**: [http://localhost:3000](http://localhost:3000)

### 4. Build for Production
To test production builds locally:
```bash
# Build backend server
npm run build --prefix server

# Build frontend client
npm run build --prefix client
```

---

## 📖 Module Implementations

### 1. Website Crawling (`server/src/services/crawler.ts`)
*   Automatically resolves absolute URLs and follows site navigation paths to extract content from core subpages (`/about`, `/products`, `/pricing`, `/services`).
*   Cleans raw HTML by ignoring headers, footers, script files, CSS, images, and non-ASCII characters to keep LLM context clean.
*   Gracefully ignores login/register/careers/blog pages to preserve rate-limits and token space.

### 2. AI Company Research (`server/src/services/ai.ts`)
*   Prompts a professional business model for structured output matching a TypeScript interface.
*   Enforces JSON output format (`response_format: { type: "json_object" }`).
*   Includes robust parsing fallbacks (regex matching) and comprehensive API error checks (safe parsing of OpenRouter's `choices` array and nested `error.message` payloads).

### 3. Competitor Analysis (`server/src/services/serper.ts`)
*   Performs targeted search queries using Google Serper.dev API.
*   Discovers official sites, contact numbers, corporate addresses, and related competitive companies.
*   Pipes search-extracted competitive intelligence directly into the AI system context for enhanced report resolution.

### 4. PDF Generation (`server/src/services/pdf.ts`)
*   Builds professional corporate reports dynamically using `pdfkit` (A4 standard portrait).
*   Applies a premium style guide: customized palettes, precise grid spacing, section divider lines, bullet lists, and header layouts.
*   Saves the resulting file on the server's temp storage disk and exposes it via a secure stream endpoint.

### 5. Discord Integration (`server/src/services/discord.ts`)
*   Sends applicant information (Name, Email, Site URL) directly to a specified Discord channel.
*   Attaches the generated PDF report as a multi-part file stream (`FormData` + native `Blob` formatting for Node.js 20 compatibility) without depending on external file servers.