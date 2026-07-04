# AI Company Research Assistant - Design Document

## Project Overview

The AI Company Research Assistant is a web application that researches any company using either its name or website URL. The application automatically discovers company information, crawls important website pages, gathers additional public information, analyzes the collected data using AI, identifies competitors, generates professional insights, and produces a downloadable PDF report.

The application is designed as a modern ChatGPT-style interface where users interact naturally while the system performs the research workflow in the background.

---

# Goals

* Research any company from a company name or website URL.
* Automatically crawl important website pages.
* Generate AI-powered business insights.
* Suggest competitors.
* Generate a downloadable PDF report.
* Optionally send the report to a Discord channel.
* Deploy as a single full-stack application.

---

# Technology Stack

## Frontend

* React
* Vite
* TypeScript
* Tailwind CSS
* React Markdown
* React Icons

---

## Backend

* Node.js
* Express
* Axios
* Cheerio
* PDFKit (or pdf-lib)
* Multer
* FormData

---

## External Services

### AI

OpenRouter API

Responsibilities:

* Company Summary
* Products & Services
* Pain Points
* Competitor Suggestions

---

### Search

Serper.dev API

Responsibilities:

* Find official company website
* Search company information
* Search contact details
* Search competitors

---

### Discord API

Responsibilities:

* Upload generated PDF
* Send applicant details
* Send research report

---

# System Architecture

```
                User

                  │

                  ▼

         React Chat Interface

                  │

                  ▼

          Express Backend API

        ┌─────────┼─────────┐

        │         │         │

        ▼         ▼         ▼

     Serper    Website    OpenRouter
      Search    Crawler       AI

        │

        ▼

   Structured Company Data

        │

        ▼

     PDF Generator

        │

        ▼

      Discord API
```

---

# Folder Structure

```
project/

├── client/
│
│   ├── src/
│   │
│   ├── components/
│   │     ChatWindow
│   │     ChatMessage
│   │     InputBox
│   │     ProgressSteps
│   │     ReportCard
│   │     DownloadButton
│   │
│   ├── pages/
│   │     Home
│   │     Settings
│   │
│   ├── hooks/
│   ├── services/
│   └── App.tsx
│
├── server/
│
│   ├── routes/
│   │     research.ts
│   │     pdf.ts
│   │     discord.ts
│   │
│   ├── services/
│   │     serper.ts
│   │     crawler.ts
│   │     ai.ts
│   │     pdf.ts
│   │     discord.ts
│   │
│   ├── utils/
│   └── index.ts
│
├── README.md
├── DESIGN.md
└── .env
```

---

# Application Workflow

## Step 1

User enters:

* Company Name

or

* Website URL

Example:

```
Microsoft
```

or

```
https://stripe.com
```

---

## Step 2

If a company name is provided:

Call Serper API.

Search:

```
Microsoft Official Website
```

Result:

```
https://microsoft.com
```

---

## Step 3

Start Website Crawling

Important pages:

* Home
* About
* Products
* Services
* Solutions
* Contact
* Pricing

Ignored pages:

* Login
* Sign In
* Careers
* Blog
* Privacy
* Terms
* Dashboard
* Account

Duplicate URLs are ignored.

---

## Step 4

Extract Content

For each page:

* Remove scripts
* Remove styles
* Remove navigation
* Remove footer
* Extract visible text
* Clean whitespace
* Merge content

---

## Step 5

Collect Public Information

Using Serper:

Search:

* Company phone
* Address
* Products
* Services
* Company overview
* Competitors

---

## Step 6

Prepare AI Prompt

Collected website content

*

Public search information

↓

Send to OpenRouter

Prompt asks AI to generate:

* Company Summary
* Products
* Services
* Pain Points
* Competitor Suggestions

Return structured JSON.

---

## Step 7

Display Report

Chat interface displays:

Company

Website

Phone

Address

Products

Pain Points

Competitors

PDF Download Button

---

## Step 8

Generate PDF

PDF includes:

* Company Name
* Website
* Phone
* Address
* Products
* AI Summary
* Pain Points
* Competitors
* Date Generated

---

## Step 9 (Bonus)

Discord Integration

After PDF generation:

Send:

Applicant Name

Applicant Email

Company Name

Website

Attach generated PDF

---

# Backend API Design

## POST

```
/api/research
```

Input

```
{
    "query":"Microsoft",
    "model":"deepseek/deepseek-r1-0528:free"
}
```

Response

```
{
    company:{},
    products:[],
    competitors:[],
    pdfUrl:""
}
```

---

## POST

```
/api/pdf
```

Returns

Generated PDF.

---

## POST

```
/api/discord
```

Uploads report to Discord.

---

# Frontend Screens

## Home

Contains

* Chat messages
* Input box
* AI Model selector
* Generate button
* Download PDF button

---

## Settings

Contains

Applicant Details

* Name
* Email

Discord Configuration

* Bot Token
* Channel ID

Save Button

---

# Progress Indicator

The interface displays live progress.

```
Searching company...

Finding official website...

Crawling pages...

Extracting content...

Searching public information...

Generating AI insights...

Finding competitors...

Generating PDF...

Completed
```

---

# AI Prompt Strategy

Prompt requests structured JSON.

Fields:

* Company Summary
* Products
* Services
* Pain Points
* Competitors

Using JSON makes rendering and PDF generation easier.

---

# Error Handling

Possible errors:

* Invalid company
* Website unreachable
* AI timeout
* Search API failure
* Crawl failure
* PDF generation failure

The application displays user-friendly error messages and allows retrying.

---

# Deployment

Frontend:

* Vercel

Backend:

* Vercel Serverless Functions (or Express on Render)

Environment Variables:

```
SERPER_API_KEY=

OPENROUTER_API_KEY=

DISCORD_BOT_TOKEN=

DISCORD_CHANNEL_ID=
```

---

# Future Improvements

* Multi-threaded website crawling
* AI-powered page ranking
* Semantic duplicate detection
* Streaming AI responses
* Report history
* Authentication
* Vector search (RAG)
* Export to DOCX
* Email report delivery
* Scheduled company monitoring

---

# Key Features Summary

* Company Name or URL Input
* Official Website Discovery
* Intelligent Website Crawling
* Public Information Search
* AI Company Analysis
* Competitor Identification
* ChatGPT-style User Interface
* Downloadable PDF Report
* Discord Report Sharing
* Responsive Design
* Single-click Deployment
