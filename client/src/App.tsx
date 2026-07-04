import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Check, 
  Download, 
  Loader2, 
  Phone, 
  MapPin, 
  ExternalLink,
  AlertTriangle,
  Eye,
  EyeOff,
  Menu,
  X,
  Send,
  Settings,
  Globe,
  Search,
  Cpu,
  FileText,
  Compass,
  ArrowRight
} from 'lucide-react';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

// Types for configuration
interface ApiConfig {
  openRouterKey: string;
  serperKey: string;
  model: string;
}

interface DiscordConfig {
  botToken: string;
  channelId: string;
  applicantName: string;
  applicantEmail: string;
}

interface Competitor {
  name: string;
  url: string;
}

interface ResearchReport {
  companyName: string;
  website: string;
  phone: string;
  address: string;
  summary: string;
  products: string[];
  painPoints: string[];
  competitors: Competitor[];
  pdfFilename: string;
  pdfUrl: string;
}

interface StreamMessage {
  step: 'website_discovery' | 'crawling' | 'public_search' | 'ai_analysis' | 'pdf_generation' | 'completed' | 'error';
  message: string;
  data?: any;
}

export default function App() {
  // Collapsible Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Sidebar config tabs: 'api' or 'discord'
  const [activeTab, setActiveTab] = useState<'api' | 'discord'>('api');

  // Configuration States
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    openRouterKey: '',
    serperKey: '',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  });

  const [discordConfig, setDiscordConfig] = useState<DiscordConfig>({
    botToken: '',
    channelId: '',
    applicantName: '',
    applicantEmail: '',
  });

  // UI Status
  const [query, setQuery] = useState('');
  const [activeResearchQuery, setActiveResearchQuery] = useState('');
  const [researchState, setResearchState] = useState<'idle' | 'searching' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Password Visibility States
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);

  // Streaming progress track
  const [progressLog, setProgressLog] = useState<{ step: string; message: string; timestamp: Date }[]>([]);
  const [activeStep, setActiveStep] = useState<string>('');
  const [showRawLogs, setShowRawLogs] = useState(false);
  
  // Report Result
  const [report, setReport] = useState<ResearchReport | null>(null);

  // Discord Sending State
  const [discordStatus, setDiscordStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [discordError, setDiscordError] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load configs from localStorage on mount
  useEffect(() => {
    const savedApi = localStorage.getItem('research_api_config');
    if (savedApi) {
      try {
        const parsed = JSON.parse(savedApi);
        if (parsed.model === 'meta-llama/llama-3-8b-instruct:free') {
          parsed.model = 'openrouter/free';
          localStorage.setItem('research_api_config', JSON.stringify(parsed));
        }
        setApiConfig(parsed);
      } catch (e) {}
    }

    const savedDiscord = localStorage.getItem('research_discord_config');
    if (savedDiscord) {
      try {
        setDiscordConfig(JSON.parse(savedDiscord));
      } catch (e) {}
    }
  }, []);

  // Save configurations
  const handleSaveApiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('research_api_config', JSON.stringify(apiConfig));
    alert('API configuration saved successfully!');
  };

  const handleSaveDiscordConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('research_discord_config', JSON.stringify(discordConfig));
    alert('Discord & Applicant settings saved successfully!');
  };

  // Quick suggestions click handler
  const handleSuggestionClick = (companyInput: string) => {
    setQuery(companyInput);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    // Proactively launch search
    launchResearch(companyInput);
  };

  // Reset to initial research
  const handleNewResearch = () => {
    setQuery('');
    setActiveResearchQuery('');
    setResearchState('idle');
    setProgressLog([]);
    setActiveStep('');
    setReport(null);
    setDiscordStatus('idle');
    setDiscordError('');
    setErrorMessage('');
  };

  // Pre-configured launcher
  const launchResearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setActiveResearchQuery(searchQuery.trim());
    setResearchState('searching');
    setProgressLog([]);
    setReport(null);
    setDiscordStatus('idle');
    setDiscordError('');
    setErrorMessage('');
    setActiveStep('website_discovery');

    try {
      const response = await fetch(`${API_BASE}/api/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-serper-key': apiConfig.serperKey,
          'x-openrouter-key': apiConfig.openRouterKey,
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          model: apiConfig.model,
        }),
      });

      if (!response.body) {
        throw new Error('Server returned an empty stream response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith('data: ')) continue;

          const jsonStr = cleanLine.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data: StreamMessage = JSON.parse(jsonStr);
            
            if (data.step !== 'completed' && data.step !== 'error') {
              setActiveStep(data.step);
            }

            setProgressLog(prev => [
              ...prev,
              { step: data.step, message: data.message, timestamp: new Date() }
            ]);

            if (data.step === 'completed' && data.data) {
              setReport(data.data);
              setResearchState('completed');
              
              if (discordConfig.botToken && discordConfig.channelId) {
                sendToDiscord(data.data);
              }
            } else if (data.step === 'error') {
              setResearchState('error');
              setErrorMessage(data.message);
            }
          } catch (e) {
            console.error('Error parsing SSE packet:', e, jsonStr);
          }
        }
      }
    } catch (error: any) {
      setResearchState('error');
      setErrorMessage(error.message || 'An unexpected networking error occurred.');
    }
  };

  const startResearch = () => {
    launchResearch(query);
  };

  // Push to Discord
  const sendToDiscord = async (currentReport: ResearchReport | null = report) => {
    if (!currentReport) return;
    if (!discordConfig.botToken || !discordConfig.channelId) {
      setDiscordStatus('error');
      setDiscordError('Missing Discord configurations. Enter details in the settings sidebar.');
      return;
    }

    setDiscordStatus('sending');
    setDiscordError('');

    try {
      const res = await fetch(`${API_BASE}/api/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botToken: discordConfig.botToken,
          channelId: discordConfig.channelId,
          applicantName: discordConfig.applicantName,
          applicantEmail: discordConfig.applicantEmail,
          companyName: currentReport.companyName,
          websiteUrl: currentReport.website,
          pdfFilename: currentReport.pdfFilename,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Discord service failed to send report.');
      }

      setDiscordStatus('sent');
    } catch (e: any) {
      console.error(e);
      setDiscordStatus('error');
      setDiscordError(e.message || 'Failed to dispatch report to Discord.');
    }
  };

  // Autoscroll logs
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLog]);

  // Handle enter key submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startResearch();
    }
  };

  // Steps configurations
  const stepsList = [
    { key: 'website_discovery', title: 'Resolving Domain', icon: Compass },
    { key: 'crawling', title: 'Scraping Website Pages', icon: Globe },
    { key: 'public_search', title: 'Fetching Public Contacts', icon: Search },
    { key: 'ai_analysis', title: 'AI Research Analysis', icon: Cpu },
    { key: 'pdf_generation', title: 'Assembling PDF Report', icon: FileText }
  ];

  const getStepStatus = (stepKey: string) => {
    const activeIdx = stepsList.findIndex(s => s.key === activeStep);
    const targetIdx = stepsList.findIndex(s => s.key === stepKey);
    
    if (researchState === 'completed') return 'completed';
    if (researchState === 'error') {
      return targetIdx < activeIdx ? 'completed' : targetIdx === activeIdx ? 'failed' : 'idle';
    }
    return targetIdx < activeIdx ? 'completed' : targetIdx === activeIdx ? 'active' : 'idle';
  };

  // Validate if keys are present
  const keysMissing = !apiConfig.openRouterKey || !apiConfig.serperKey;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-slate-200 font-sans">
      
      {/* 1. SIDEBAR (API Keys / Settings Panel) */}
      <aside className={`h-full border-r border-[#212121] bg-[#171717] flex flex-col justify-between shrink-0 transition-all duration-300 z-20 ${
        sidebarOpen ? 'w-[320px] translate-x-0' : 'w-0 -translate-x-full overflow-hidden border-none'
      }`}>
        
        {/* Sidebar Header */}
        <div className="p-5 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold text-lg">
              Ω
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white tracking-wide leading-tight">
                Relu Consultancy
              </h2>
              <p className="text-[9px] text-slate-500 font-mono tracking-widest font-bold">
                RESEARCH CO-PILOT
              </p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1 hover:bg-[#212121] text-slate-400 hover:text-white rounded-md transition cursor-pointer"
            title="Hide Sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sidebar Middle (Tabs & Forms) */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-5">
          {/* New Search trigger */}
          <button
            onClick={handleNewResearch}
            className="w-full py-2 px-3 rounded-lg border border-[#333] hover:border-[#444] bg-[#212121] hover:bg-[#262626] text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Plus size={14} />
            New Research
          </button>

          {/* Config Tabs Switcher */}
          <div className="flex bg-[#212121] p-0.5 rounded-lg border border-[#333]">
            <button
              onClick={() => setActiveTab('api')}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wide transition cursor-pointer ${
                activeTab === 'api' 
                  ? 'bg-[#2f2f2f] text-white' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              API Credentials
            </button>
            <button
              onClick={() => setActiveTab('discord')}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wide transition cursor-pointer ${
                activeTab === 'discord' 
                  ? 'bg-[#2f2f2f] text-white' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Discord Bot
            </button>
          </div>

          {/* Configuration Form Display */}
          {activeTab === 'api' ? (
            <form onSubmit={handleSaveApiConfig} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">OPENROUTER API KEY</label>
                <div className="relative">
                  <input
                    type={showOpenRouterKey ? "text" : "password"}
                    value={apiConfig.openRouterKey}
                    onChange={e => setApiConfig({ ...apiConfig, openRouterKey: e.target.value })}
                    placeholder="sk-or-v1-..."
                    autoComplete="new-password"
                    className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md pl-3 pr-10 py-1.5 text-xs font-mono w-full text-slate-100 placeholder-slate-750 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 cursor-pointer flex items-center justify-center"
                  >
                    {showOpenRouterKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">SERPER.DEV API KEY</label>
                <div className="relative">
                  <input
                    type={showSerperKey ? "text" : "password"}
                    value={apiConfig.serperKey}
                    onChange={e => setApiConfig({ ...apiConfig, serperKey: e.target.value })}
                    placeholder="Search API key..."
                    autoComplete="new-password"
                    className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md pl-3 pr-10 py-1.5 text-xs font-mono w-full text-slate-100 placeholder-slate-750 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSerperKey(!showSerperKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-355 cursor-pointer flex items-center justify-center"
                  >
                    {showSerperKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">LLM MODEL</label>
                <select
                  value={apiConfig.model}
                  onChange={e => setApiConfig({ ...apiConfig, model: e.target.value })}
                  className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md px-2 py-1.5 text-xs w-full text-slate-100 cursor-pointer transition"
                >
                  <option value="nvidia/nemotron-3-ultra-550b-a55b:free">NVIDIA: Nemotron 3 (Free)</option>
                  <option value="openrouter/free">Auto Free Model Routing (Free)</option>
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="deepseek/deepseek-chat">Deepseek Chat V3</option>
                  <option value="deepseek/deepseek-r1:free">Deepseek R1 (Free)</option>
                  <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-bold rounded-md transition cursor-pointer shadow-md shadow-emerald-900/10"
              >
                Save Settings
              </button>
            </form>
          ) : (
            <form onSubmit={handleSaveDiscordConfig} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">DISCORD BOT TOKEN</label>
                <div className="relative">
                  <input
                    type={showBotToken ? "text" : "password"}
                    value={discordConfig.botToken}
                    onChange={e => setDiscordConfig({ ...discordConfig, botToken: e.target.value })}
                    placeholder="Bot token..."
                    autoComplete="new-password"
                    className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md pl-3 pr-10 py-1.5 text-xs font-mono w-full text-slate-100 placeholder-slate-750 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 cursor-pointer flex items-center justify-center"
                  >
                    {showBotToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">CHANNEL ID</label>
                <input
                  type="text"
                  value={discordConfig.channelId}
                  onChange={e => setDiscordConfig({ ...discordConfig, channelId: e.target.value })}
                  placeholder="e.g. 110292837482"
                  className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md px-3 py-1.5 text-xs font-mono w-full text-slate-100 placeholder-slate-750 transition"
                />
              </div>

              <div className="pt-2.5 border-t border-[#262626] flex flex-col gap-3">
                <p className="text-[10px] font-bold text-slate-500 tracking-wider">APPLICANT METADATA</p>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Your Name</label>
                  <input
                    type="text"
                    value={discordConfig.applicantName}
                    onChange={e => setDiscordConfig({ ...discordConfig, applicantName: e.target.value })}
                    placeholder="Full name"
                    className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md px-3 py-1.5 text-xs w-full text-slate-100 placeholder-slate-750 transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Your Email</label>
                  <input
                    type="email"
                    value={discordConfig.applicantEmail}
                    onChange={e => setDiscordConfig({ ...discordConfig, applicantEmail: e.target.value })}
                    placeholder="name@domain.com"
                    className="bg-[#212121] border border-[#2f2f2f] focus:border-slate-500 outline-none rounded-md px-3 py-1.5 text-xs w-full text-slate-100 placeholder-slate-750 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-1.5 py-1.5 bg-[#4f46e5] hover:bg-[#4338ca] active:scale-[0.98] text-white text-xs font-bold rounded-md transition cursor-pointer"
              >
                Save Settings
              </button>
            </form>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#262626] bg-[#121212] flex items-center justify-between text-[10px] font-mono text-slate-550 select-none">
          <span>v1.2.0</span>
          <span>·</span>
          <span>OpenRouter & Cheerio</span>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE (ChatGPT-Style Feed) */}
      <main className="flex-1 bg-[#212121] flex flex-col relative h-full overflow-hidden">
        
        {/* Floating Sidebar Toggle Button / Header */}
        <header className="h-14 border-b border-[#2f2f2f] flex items-center justify-between px-6 bg-[#212121]/95 backdrop-blur z-10 shrink-0 select-none">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 hover:bg-[#2f2f2f] text-slate-350 hover:text-white rounded-md transition cursor-pointer"
                title="Show settings sidebar"
              >
                <Menu size={18} />
              </button>
            )}
            <span className="font-semibold text-[13px] text-white tracking-wide">Company Intel Co-Pilot</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 font-mono text-[9px] font-bold tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              READY
            </span>
          </div>

          {/* Quick config settings trigger for small screens */}
          {keysMissing && (
            <div className="flex items-center gap-2 text-xs text-amber-500 font-semibold animate-pulse">
              <Settings size={14} className="animate-spin" />
              <span>Configure API keys in settings</span>
            </div>
          )}
        </header>

        {/* Chat Feed Scroll Area */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center">
          
          {/* STATE A: WELCOME GREETING PAGE (No active query / idle) */}
          {researchState === 'idle' && (
            <div className="max-w-[720px] w-full px-5 py-20 md:py-28 flex flex-col items-center justify-center my-auto text-center select-none animate-fadeIn">
              
              {/* ChatGPT Icon Accent */}
              <div className="w-14 h-14 rounded-full bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-semibold text-3xl mb-8 shadow-lg shadow-emerald-950/20">
                Ω
              </div>
              
              <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight leading-tight mb-8">
                How can I help you research today?
              </h2>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                {[
                  { title: 'Research Notion', desc: 'Find domain notion.so, extract details, and list competitors.', query: 'notion.so' },
                  { title: 'Analyze Stripe', desc: 'Inspect products, pricing models, and key user challenges.', query: 'Stripe' },
                  { title: 'Investigate Figma', desc: 'Gather search contacts, company summary, and generate PDF.', query: 'Figma' },
                  { title: 'Discover Linear', desc: 'Scrape product roadmap options, pain points, and alternatives.', query: 'Linear' }
                ].map(item => (
                  <button
                    key={item.title}
                    onClick={() => handleSuggestionClick(item.query)}
                    className="p-4 rounded-xl bg-[#2f2f2f]/45 hover:bg-[#2f2f2f]/90 border border-[#2f2f2f] hover:border-slate-700/60 text-left transition duration-200 cursor-pointer group flex justify-between items-start gap-4"
                  >
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200 group-hover:text-white transition">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-normal mt-1">
                        {item.desc}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-slate-500 group-hover:text-emerald-450 transition shrink-0 mt-0.5 group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STATE B: ACTIVE PIPELINE SCREEN (Searching, Completed, or Error) */}
          {researchState !== 'idle' && (
            <div className="max-w-[760px] w-full px-5 py-8 flex flex-col gap-6">
              
              {/* 1. USER'S PROMPT MESSAGE (Right-aligned bubble) */}
              <div className="flex gap-4 items-start justify-end w-full">
                <div className="max-w-[85%] rounded-2xl bg-[#2f2f2f] border border-[#3e3e3e] px-4 py-2.5 text-sm text-slate-100 font-sans shadow-md select-text">
                  <p className="text-xs text-slate-450 font-bold mb-1 uppercase font-mono tracking-wider select-none">Research Query</p>
                  <span className="font-medium text-[13.5px] leading-relaxed">{activeResearchQuery}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0 select-none">
                  U
                </div>
              </div>

              {/* 2. ASSISTANT'S CONVERSATIONAL REPLY (Left-aligned bubble) */}
              <div className="flex gap-4 items-start w-full leading-relaxed">
                {/* Assistant Logo */}
                <div className="w-8 h-8 rounded-full bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-semibold shrink-0 select-none">
                  Ω
                </div>

                {/* AI response content */}
                <div className="flex-1 min-w-0">
                  
                  {/* C. LOADING PIPELINE CHECKLIST (Shows while active) */}
                  {researchState === 'searching' && (
                    <div className="rounded-2xl border border-[#2f2f2f] bg-[#1a1a1a] p-6 shadow-xl flex flex-col gap-5 animate-pulse">
                      <div className="flex justify-between items-center pb-2.5 border-b border-[#2d2d2d]">
                        <span className="text-xs font-bold text-slate-350 tracking-wide uppercase font-mono">Agent Workflow Process</span>
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                          <Loader2 size={13} className="animate-spin" />
                          Thinking...
                        </div>
                      </div>

                      {/* Agent steps checklist */}
                      <div className="flex flex-col gap-4">
                        {stepsList.map((step) => {
                          const status = getStepStatus(step.key);
                          const StepIcon = step.icon;
                          
                          return (
                            <div key={step.key} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center transition border ${
                                  status === 'completed' 
                                    ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400' 
                                    : status === 'active'
                                      ? 'bg-emerald-600/5 border-emerald-500/20 text-emerald-400 animate-pulse'
                                      : 'bg-[#262626] border-[#333] text-slate-500'
                                }`}>
                                  {status === 'completed' ? (
                                    <Check size={12} strokeWidth={3} />
                                  ) : (
                                    <StepIcon size={12} />
                                  )}
                                </div>
                                <span className={`text-[12.5px] font-semibold transition ${
                                  status === 'completed' 
                                    ? 'text-slate-300' 
                                    : status === 'active'
                                      ? 'text-emerald-400 font-bold'
                                      : 'text-slate-500'
                                }`}>
                                  {step.title}
                                </span>
                              </div>
                              
                              <div className="text-[10px] font-mono">
                                {status === 'completed' && <span className="text-emerald-500 font-bold">Done</span>}
                                {status === 'active' && <span className="text-emerald-400 font-semibold animate-pulse">Running</span>}
                                {status === 'idle' && <span className="text-slate-600">Pending</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Collapsible raw logs area */}
                      <div className="pt-2">
                        <button
                          onClick={() => setShowRawLogs(!showRawLogs)}
                          className="text-[10px] font-bold text-slate-450 hover:text-white uppercase font-mono tracking-wider flex items-center gap-1 transition cursor-pointer select-none"
                        >
                          {showRawLogs ? '▼ Hide Console Logs' : '▶ Show Console Logs'}
                        </button>
                        
                        {showRawLogs && (
                          <div className="mt-3 rounded-lg bg-black border border-[#2d2d2d] p-4 text-[10.5px] font-mono text-slate-400 max-h-[180px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin select-text">
                            {progressLog.map((log, index) => (
                              <div key={index} className="flex gap-3 leading-normal">
                                <span className="text-slate-650">{log.timestamp.toLocaleTimeString([], { hour12: false })}</span>
                                <span className={log.step === 'error' ? 'text-red-400' : 'text-slate-300'}>
                                  {log.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* D. PIPELINE ERROR DISPLAY */}
                  {researchState === 'error' && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 shadow-xl flex flex-col items-center text-center">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-450 mb-3 select-none">
                        <AlertTriangle size={20} />
                      </div>
                      <h3 className="font-semibold text-sm text-white mb-1.5">Research Process Encountered an Error</h3>
                      <p className="text-slate-400 text-xs leading-relaxed max-w-[500px] mb-5 select-text">
                        {errorMessage || 'An error occurred while compiling analysis statistics.'}
                      </p>
                      <button
                        onClick={handleNewResearch}
                        className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#333] hover:text-white rounded-lg text-xs font-semibold cursor-pointer transition active:scale-[0.98] select-none"
                      >
                        Reset & Try Again
                      </button>
                    </div>
                  )}

                  {/* E. COMPLETED RESEARCH REPORT CARD (Senior Designer Dashboard) */}
                  {researchState === 'completed' && report && (
                    <div className="flex flex-col gap-5 select-text">
                      
                      {/* Dashboard Container */}
                      <div className="rounded-2xl border border-[#2d2d2d] bg-[#1a1a1a] overflow-hidden shadow-2xl relative">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

                        {/* Card Header (Company name, Web site, Status Badge) */}
                        <div className="px-6 py-5 border-b border-[#2d2d2d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#1d1d1d]">
                          <div>
                            <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                              {report.companyName}
                            </h3>
                            <a 
                              href={report.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-emerald-450 hover:text-emerald-400 flex items-center gap-1 mt-1 transition"
                            >
                              {report.website}
                              <ExternalLink size={11} />
                            </a>
                          </div>
                          
                          <span className="px-2.5 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-450 text-[9.5px] font-bold font-mono tracking-widest uppercase select-none">
                            Success
                          </span>
                        </div>

                        {/* Section Grid: Phone and Address */}
                        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-b border-[#2d2d2d] bg-[#181818]/60">
                          <div className="flex gap-3 items-start">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 select-none">
                              <Phone size={12} />
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-slate-500 tracking-wider uppercase font-mono block">CORPORATE TELEPHONE</span>
                              <span className="text-[12px] font-semibold text-slate-200">{report.phone || 'Unavailable'}</span>
                            </div>
                          </div>

                          <div className="flex gap-3 items-start">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 select-none">
                              <MapPin size={12} />
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-slate-500 tracking-wider uppercase font-mono block">HEADQUARTERS ADDRESS</span>
                              <span className="text-[12px] font-semibold text-slate-200">{report.address || 'Unavailable'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Executive Summary */}
                        {report.summary && (
                          <div className="px-6 py-5 border-b border-[#2d2d2d]">
                            <h4 className="text-[10px] font-bold text-emerald-450 tracking-widest font-mono uppercase mb-2 select-none">
                              Executive Summary
                            </h4>
                            <p className="text-slate-300 text-xs md:text-[13px] leading-relaxed font-sans font-medium text-justify">
                              {report.summary}
                            </p>
                          </div>
                        )}

                        {/* Products / Services Section */}
                        {report.products && report.products.length > 0 && (
                          <div className="px-6 py-5 border-b border-[#2d2d2d]">
                            <h4 className="text-[10px] font-bold text-emerald-450 tracking-widest font-mono uppercase mb-3 select-none">
                              Key Products & Core Services
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {report.products.map((product, idx) => (
                                <span 
                                  key={idx}
                                  className="px-2.5 py-1 rounded bg-[#2a2a2a] border border-[#383838] text-[11px] font-semibold text-slate-300 select-none hover:text-white transition"
                                >
                                  {product}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Market Pain Points Section */}
                        {report.painPoints && report.painPoints.length > 0 && (
                          <div className="px-6 py-5 border-b border-[#2d2d2d]">
                            <h4 className="text-[10px] font-bold text-emerald-450 tracking-widest font-mono uppercase mb-3 select-none">
                              Market Challenges & Solved Pain Points
                            </h4>
                            <ul className="flex flex-col gap-2.5 font-sans">
                              {report.painPoints.map((point, idx) => (
                                <li key={idx} className="flex gap-2.5 items-start text-xs md:text-[13px] leading-relaxed text-slate-300">
                                  <span className="text-emerald-500 font-bold shrink-0 mt-0.5">•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Competitor Grid */}
                        {report.competitors && report.competitors.length > 0 && (
                          <div className="px-6 py-5">
                            <h4 className="text-[10px] font-bold text-emerald-450 tracking-widest font-mono uppercase mb-3.5 select-none">
                              Competitor Landscape & Alternatives
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {report.competitors.map((comp, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-[#1f1f1f] border border-[#2f2f2f] hover:border-[#383838] rounded-xl p-3 flex justify-between items-center transition"
                                >
                                  <span className="text-xs font-bold text-slate-200">{comp.name}</span>
                                  <a 
                                    href={comp.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10.5px] font-bold text-emerald-450 hover:text-emerald-400 flex items-center gap-1 transition"
                                  >
                                    Inspect Site
                                    <ExternalLink size={10} />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Action Bar (Download PDF & Share to Discord) */}
                      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#1a1a1a] border border-[#2f2f2f] rounded-2xl p-4 shadow-lg select-none">
                        
                        <a
                          href={`${API_BASE}/api/pdf/${report.pdfFilename}`}
                          download
                          className="w-full sm:w-auto px-4.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-[12px] font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950/20 cursor-pointer transition select-none"
                        >
                          <Download size={13} />
                          Download PDF Report
                        </a>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          {discordStatus === 'sent' && (
                            <span className="px-3.5 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 select-none animate-fadeIn">
                              <Check size={13} strokeWidth={2.5} />
                              Shared with Discord
                            </span>
                          )}
                          {discordStatus === 'sending' && (
                            <span className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                              <Loader2 size={12} className="animate-spin" />
                              Uploading to Discord...
                            </span>
                          )}
                          {discordStatus === 'error' && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                onClick={() => sendToDiscord()}
                                className="px-3.5 py-2 bg-red-650 hover:bg-red-600 active:scale-[0.98] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                              >
                                Retry Discord Dispatch
                              </button>
                              <span className="text-[9.5px] text-red-400 font-medium">{discordError}</span>
                            </div>
                          )}
                          {discordStatus === 'idle' && (
                            <button
                              onClick={() => sendToDiscord()}
                              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-[#444] hover:border-[#555] bg-[#2a2a2a] hover:bg-[#333] text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
                            >
                              Share to Discord
                            </button>
                          )}
                        </div>

                      </div>

                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </div>

            </div>
          )}

        </div>

        {/* 3. CENTERED STICKY BOTTOM INPUT Capsule (ChatGPT-Style) */}
        <div className="px-4 pb-6 pt-2 bg-[#212121] shrink-0 w-full flex flex-col items-center">
          <div className="max-w-[760px] w-full flex flex-col gap-2 relative">
            
            {/* Input Bar */}
            <div className="relative flex items-center bg-[#2f2f2f] hover:bg-[#343434]/80 border border-[#3e3e3e]/40 focus-within:border-slate-500/50 rounded-2xl p-2.5 shadow-xl transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Name a company (e.g. Notion) or official URL (e.g. stripe.com)..."
                disabled={researchState === 'searching'}
                rows={1}
                className="flex-1 outline-none resize-none bg-transparent text-[13.5px] text-slate-100 placeholder-slate-500 h-[28px] py-1 pl-2.5 pr-14 select-text leading-relaxed"
              />

              {/* Dynamic Action Trigger Button */}
              <button
                onClick={startResearch}
                disabled={researchState === 'searching' || !query.trim()}
                className={`absolute right-2.5 p-2 rounded-xl text-white transition duration-200 select-none ${
                  query.trim() && researchState !== 'searching'
                    ? 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer' 
                    : 'bg-[#222] text-[#444] cursor-not-allowed'
                }`}
              >
                {researchState === 'searching' ? (
                  <Loader2 size={15} className="animate-spin text-emerald-450" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>

            {/* Input footer status bar */}
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-550 tracking-wider font-semibold select-none px-2 mt-1">
              <span>PRESS ENTER TO RUN · SHIFT+ENTER FOR NEW LINE</span>
              {researchState === 'searching' && <span className="text-emerald-400 animate-pulse">SSE CHANNEL ACTIVE</span>}
            </div>

          </div>
        </div>

      </main>

    </div>
  );
}
