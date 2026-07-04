# Relu Consultancy - AI Company Research Assistant

The **AI Company Research Assistant** is a modern full-stack web application designed to automatically research any company using its name or website URL. It crawls official pages, searches public contact details, generates professional AI insights, suggest competitors, generates a downloadable PDF report, and shares it directly to a Discord channel.

---

## Key Features
- **Smart Website Discovery**: Uses Google Search via Serper.dev API to automatically resolve a company name into its official domain.
- **Intelligent Website Crawler**: Crawls the resolved website to extract and clean content from core subpages (About, Products, Pricing, Services) using Axios and Cheerio.
- **Structured AI Insights**: Employs OpenRouter API to analyze collected data and generate summaries, products, and pain points in structured JSON format.
- **Downloadable PDF Report**: Automatically builds a premium PDF report using PDFKit.
- **Discord Bot Sharing**: Dispatches generated PDF reports along with applicant details directly to a configured Discord channel.
- **ChatGPT-Style Interface**: Responsive dark-themed dashboard featuring real-time crawling status progress indicators.

---

## Tech Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS v4, Lucide React
- **Backend**: Node.js, Express, TypeScript, Axios, Cheerio, PDFKit
- **External Services**: Serper.dev (Google Search API), OpenRouter (LLM Model Access), Discord API

---

## Quick Start

### 1. Prerequisite
Ensure you have **Node.js (v18+)** installed.

### 2. Install Dependencies
Run this command from the root directory to install dependencies for the root, frontend, and backend packages:
```bash
npm install; npm run install:all
```

### 3. Set Up API Keys
Configure the API keys. You can do this in two ways:

#### Option A: In the Frontend Sidebar (Recommended)
You can directly paste your keys in the application's sidebar settings (they will be saved securely in your browser's `localStorage`):
- **Serper.dev API Key**: Get it at [serper.dev](https://serper.dev)
- **OpenRouter API Key**: Get it at [openrouter.ai](https://openrouter.ai)
- **Discord configurations**: Bot Token, Channel ID, Applicant Name, Applicant Email

#### Option B: Environment Variables
Alternatively, copy or set them in the `.env` file at the root:
```env
SERPER_API_KEY=your_serper_key_here
OPENROUTER_API_KEY=your_openrouter_key_here
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here
PORT=3000
```

### 4. Run Development Servers
Start both the React client and the Express backend concurrently:
```bash
npm run dev
```

The application will be running at:
- **Frontend**: [http://localhost:3001](http://localhost:3001)
- **Backend API**: [http://localhost:3000](http://localhost:3000)