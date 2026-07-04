import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Check, 
  Download, 
  Loader2, 
  Phone, 
  MapPin, 
  ExternalLink,
  AlertTriangle
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
  const [researchState, setResearchState] = useState<'idle' | 'searching' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Streaming progress track
  const [progressLog, setProgressLog] = useState<{ step: string; message: string; timestamp: Date }[]>([]);
  const [activeStep, setActiveStep] = useState<string>('');
  
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

  // Quick Chips click handler
  const handleChipClick = (domain: string) => {
    setQuery(domain);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Reset to initial research
  const handleNewResearch = () => {
    setQuery('');
    setResearchState('idle');
    setProgressLog([]);
    setActiveStep('');
    setReport(null);
    setDiscordStatus('idle');
    setDiscordError('');
    setErrorMessage('');
  };

  // Start Pipeline
  const startResearch = async () => {
    if (!query.trim()) return;



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
          query: query.trim(),
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
        buffer = lines.pop() || ''; // Save incomplete line for next iteration

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith('data: ')) continue;

          const jsonStr = cleanLine.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data: StreamMessage = JSON.parse(jsonStr);
            
            // Set current active step for the horizontal tracker
            if (data.step !== 'completed' && data.step !== 'error') {
              setActiveStep(data.step);
            }

            // Append to vertical details logger
            setProgressLog(prev => [
              ...prev,
              { step: data.step, message: data.message, timestamp: new Date() }
            ]);

            // Handle completion or error
            if (data.step === 'completed' && data.data) {
              setReport(data.data);
              setResearchState('completed');
              
              // Automatically send to Discord if credentials are saved
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

  // Push to Discord
  const sendToDiscord = async (currentReport: ResearchReport | null = report) => {
    if (!currentReport) return;
    if (!discordConfig.botToken || !discordConfig.channelId) {
      setDiscordStatus('error');
      setDiscordError('Missing Discord configurations. Enter details in the sidebar Settings.');
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

  // Step helper titles
  const stepsList = [
    { key: 'website_discovery', title: 'Website Discovery' },
    { key: 'crawling', title: 'Scraping Site' },
    { key: 'public_search', title: 'Public Details' },
    { key: 'ai_analysis', title: 'AI Insights' },
    { key: 'pdf_generation', title: 'PDF Generator' }
  ];

  const getStepIndex = (stepKey: string) => {
    return stepsList.findIndex(s => s.key === stepKey);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-200">
      
      {/* 1. SIDEBAR */}
      <aside className="w-[300px] border-r border-[#161c2a] bg-[#0c101b] flex flex-col justify-between shrink-0 select-none">
        
        {/* Sidebar Top Area */}
        <div className="p-5 flex flex-col gap-5 overflow-y-auto grow">
          {/* Logo Section */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-lg font-display">
              Ω
            </div>
            <div>
              <h1 className="font-display font-bold text-[16px] tracking-wide text-white leading-tight">
                Relu Consultancy
              </h1>
              <p className="text-[10px] text-amber-500/70 tracking-widest font-mono font-bold">
                COMPANY INTELLIGENCE
              </p>
            </div>
          </div>

          {/* New Research Button */}
          <button 
            onClick={handleNewResearch}
            className="w-full py-2.5 px-4 rounded-lg border border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/30 text-[13px] font-medium text-slate-300 hover:text-white flex items-center justify-center gap-2 transition duration-200 cursor-pointer"
          >
            <Plus size={16} />
            New Research
          </button>

          {/* Configuration Tab Switcher */}
          <div className="flex bg-[#121824] p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('api')}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                activeTab === 'api' 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              API
            </button>
            <button
              onClick={() => setActiveTab('discord')}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition duration-150 cursor-pointer ${
                activeTab === 'discord' 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DISCORD
            </button>
          </div>

          {/* Configuration Forms */}
          {activeTab === 'api' ? (
            <form onSubmit={handleSaveApiConfig} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">OPENROUTER API KEY</label>
                <input
                  type="password"
                  value={apiConfig.openRouterKey}
                  onChange={e => setApiConfig({ ...apiConfig, openRouterKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  autoComplete="new-password"
                  className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 outline-none rounded-md px-3 py-2 text-xs font-mono w-full text-slate-100 placeholder-slate-600 transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">SERPER.DEV API KEY</label>
                <input
                  type="password"
                  value={apiConfig.serperKey}
                  onChange={e => setApiConfig({ ...apiConfig, serperKey: e.target.value })}
                  placeholder="Your Serper key..."
                  autoComplete="new-password"
                  className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 outline-none rounded-md px-3 py-2 text-xs font-mono w-full text-slate-100 placeholder-slate-600 transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">AI MODEL</label>
                <select
                  value={apiConfig.model}
                  onChange={e => setApiConfig({ ...apiConfig, model: e.target.value })}
                  className="bg-[#121824] border border-slate-800 focus:border-amber-500/50 outline-none rounded-md px-3 py-2 text-xs w-full text-slate-100 cursor-pointer transition"
                >
                  <option value="nvidia/nemotron-3-ultra-550b-a55b:free">NVIDIA: Nemotron 3 Ultra (Free)</option>
                  <option value="openrouter/free">Auto Select Free Model (Free)</option>
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="deepseek/deepseek-chat">Deepseek Chat V3</option>
                  <option value="deepseek/deepseek-r1:free">Deepseek R1 (Free)</option>
                  <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-[#0b0f17] text-xs font-bold rounded-md transition duration-150 cursor-pointer shadow-lg shadow-amber-500/10"
              >
                Save Configuration
              </button>
            </form>
          ) : (
            <form onSubmit={handleSaveDiscordConfig} className="flex flex-col gap-4">
              <div className="bg-blue-500/5 border border-blue-500/20 text-blue-400 rounded-lg p-3 text-[11px] leading-relaxed">
                <span className="font-bold block mb-1">Discord Bot Integration</span>
                After research completes, the report auto-sends to your configured channel.
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">BOT TOKEN</label>
                <input
                  type="password"
                  value={discordConfig.botToken}
                  onChange={e => setDiscordConfig({ ...discordConfig, botToken: e.target.value })}
                  placeholder="Bot token..."
                  autoComplete="new-password"
                  className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 outline-none rounded-md px-3 py-2 text-xs font-mono w-full text-slate-100 placeholder-slate-600 transition"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">CHANNEL ID</label>
                <input
                  type="text"
                  value={discordConfig.channelId}
                  onChange={e => setDiscordConfig({ ...discordConfig, channelId: e.target.value })}
                  placeholder="000000000000000000"
                  className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 outline-none rounded-md px-3 py-2 text-xs font-mono w-full text-slate-100 placeholder-slate-600 transition"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-col gap-3">
                <p className="text-[10px] font-bold text-slate-500 tracking-wider">APPLICANT DETAILS</p>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Full Name</label>
                  <input
                    type="text"
                    value={discordConfig.applicantName}
                    onChange={e => setDiscordConfig({ ...discordConfig, applicantName: e.target.value })}
                    placeholder="Your full name"
                    className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 outline-none rounded-md px-3 py-2 text-xs w-full text-slate-100 placeholder-slate-600 transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={discordConfig.applicantEmail}
                    onChange={e => setDiscordConfig({ ...discordConfig, applicantEmail: e.target.value })}
                    placeholder="email@example.com"
                    className="bg-[#121824] border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 outline-none rounded-md px-3 py-2 text-xs w-full text-slate-100 placeholder-slate-600 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold rounded-md transition duration-150 cursor-pointer shadow-lg shadow-indigo-500/10"
              >
                Save Discord Config
              </button>
            </form>
          )}
        </div>

        {/* Sidebar Bottom Details */}
        <div className="p-5 border-t border-[#161c2a] flex flex-col gap-4 bg-[#0a0d14]">
          <div>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-2">HOW IT WORKS</p>
            <ol className="flex flex-col gap-1.5 text-[11px] text-slate-500 leading-normal font-sans">
              <li className="flex items-start gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 inline-flex items-center justify-center text-[9px] font-mono select-none">1</span> Enter a company name or URL</li>
              <li className="flex items-start gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 inline-flex items-center justify-center text-[9px] font-mono select-none">2</span> Serper.dev searches and crawls it</li>
              <li className="flex items-start gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 inline-flex items-center justify-center text-[9px] font-mono select-none">3</span> OpenRouter AI generates insights</li>
              <li className="flex items-start gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 inline-flex items-center justify-center text-[9px] font-mono select-none">4</span> Download a professional PDF report</li>
            </ol>
          </div>

          <div className="flex justify-between items-center text-[9px] font-mono text-slate-600 font-medium">
            <span>OPENROUTER</span>
            <span>·</span>
            <span>SERPER</span>
            <span>·</span>
            <span>JSPDF</span>
          </div>
        </div>

      </aside>

      {/* 2. MAIN DISPLAY CONTENT */}
      <main className="flex-1 bg-[#0b0f17] flex flex-col relative h-full">
        
        {/* Main Content Header */}
        <header className="h-[60px] border-b border-[#161c2a] flex items-center justify-between px-8 bg-[#0b0f17]/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3 select-none">
            <span className="font-display font-semibold text-[15px] tracking-wide text-white">Company Research</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              LIVE
            </span>
          </div>
        </header>

        {/* Content Body Area */}
        <div className="flex-1 overflow-y-auto px-8 py-10 flex flex-col items-center">
          
          {researchState === 'idle' && (
            <div className="max-w-[700px] w-full my-auto flex flex-col items-center text-center select-none">
              
              <span className="text-[11px] font-bold text-amber-500/90 tracking-widest font-mono uppercase mb-4">
                AI-Powered Intelligence
              </span>
              
              <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white tracking-tight leading-tight mb-4">
                Know any company<br />in minutes.
              </h2>
              
              <p className="text-slate-400 text-sm md:text-base leading-relaxed font-sans max-w-[540px] mb-8">
                Enter a company name or website URL to get AI-powered insights, competitor analysis, pain points, and a professional PDF report.
              </p>

              {/* Quick Chips Selection */}
              <div className="flex flex-wrap gap-2.5 justify-center mb-10">
                {['notion.so', 'Figma', 'Linear', 'Vercel'].map(chip => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    className="px-4 py-1.5 rounded-full bg-[#121824] hover:bg-[#182030] border border-slate-800/80 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer transition duration-150"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-slate-500 text-xs font-mono">
                <span className="h-px w-8 bg-slate-800"></span>
                <span>Configure API keys in the sidebar to get started</span>
                <span className="h-px w-8 bg-slate-800"></span>
              </div>
            </div>
          )}

          {researchState === 'searching' && (
            <div className="max-w-[750px] w-full flex flex-col gap-8 my-auto">
              
              {/* Stepper component */}
              <div className="glass-card rounded-xl p-6 border border-slate-800/80">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[13px] font-bold text-slate-300 tracking-wide uppercase font-display">Research Progress</h3>
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <Loader2 size={14} className="animate-spin" />
                    Running pipeline...
                  </div>
                </div>

                {/* Horizontal steps display */}
                <div className="relative flex justify-between items-center w-full">
                  <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-800 -translate-y-1/2 -z-10"></div>
                  
                  {/* Visual tracker fill */}
                  <div 
                    className="absolute top-1/2 left-0 h-[2px] bg-amber-500 -translate-y-1/2 -z-10 transition-all duration-500"
                    style={{
                      width: `${(Math.max(0, getStepIndex(activeStep)) / (stepsList.length - 1)) * 100}%`
                    }}
                  ></div>

                  {stepsList.map((step, idx) => {
                    const activeIdx = getStepIndex(activeStep);
                    const isCompleted = idx < activeIdx;
                    const isActive = idx === activeIdx;

                    return (
                      <div key={step.key} className="flex flex-col items-center gap-2 relative">
                        <div 
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none transition-all duration-300 border ${
                            isCompleted 
                              ? 'bg-amber-500 border-amber-500 text-[#0b0f17]' 
                              : isActive 
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)] animate-pulse'
                                : 'bg-[#0f172a] border-slate-800 text-slate-500'
                          }`}
                        >
                          {isCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                        </div>
                        <span 
                          className={`text-[10px] font-semibold tracking-wide whitespace-nowrap absolute -bottom-6 left-1/2 -translate-x-1/2 ${
                            isActive ? 'text-amber-400' : isCompleted ? 'text-slate-300' : 'text-slate-600'
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Logs output */}
              <div className="glass-panel border border-slate-800/80 rounded-xl flex flex-col h-[320px]">
                <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 font-mono tracking-wider">CRAWLER & AI CONSOLE LOGS</span>
                  <span className="text-[10px] text-slate-500 font-mono">Real-time status</span>
                </div>
                
                <div className="flex-1 p-5 overflow-y-auto font-mono text-[11px] text-slate-400 flex flex-col gap-2 bg-[#080b11]">
                  {progressLog.map((log, index) => (
                    <div key={index} className="flex gap-4 items-start py-0.5 leading-relaxed">
                      <span className="text-slate-600 select-none">
                        {log.timestamp.toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span className={
                        log.step === 'error' 
                          ? 'text-red-400' 
                          : log.step === 'completed' 
                            ? 'text-emerald-400' 
                            : 'text-slate-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>

            </div>
          )}

          {researchState === 'error' && (
            <div className="max-w-[600px] w-full my-auto flex flex-col items-center text-center p-8 bg-red-500/5 border border-red-500/20 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="font-display font-bold text-lg text-white mb-2">Research Operation Failed</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                {errorMessage || 'Something went wrong during the intelligence gathering stage.'}
              </p>
              <button
                onClick={handleNewResearch}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition active:scale-[0.98]"
              >
                Go Back & Retry
              </button>
            </div>
          )}

          {researchState === 'completed' && report && (
            <div className="max-w-[800px] w-full flex flex-col gap-6">
              
              {/* Report Dashboard Card */}
              <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-8 relative overflow-hidden shadow-2xl">
                
                {/* Visual side glow accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -z-10"></div>

                {/* Dashboard Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div>
                    <h3 className="text-3xl font-display font-extrabold text-white tracking-tight mb-1">
                      {report.companyName}
                    </h3>
                    <a 
                      href={report.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition"
                    >
                      {report.website}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  
                  <span className="self-start sm:self-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold tracking-wider select-none">
                    RESEARCH COMPLETE
                  </span>
                </div>

                {/* Info grids (phone & address) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6 border-b border-slate-800">
                  <div className="bg-[#121824] border border-slate-800/80 rounded-lg p-4 flex gap-3.5 items-start">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <Phone size={14} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 tracking-wider block mb-0.5">PHONE</span>
                      <span className="text-xs font-semibold text-slate-200">{report.phone}</span>
                    </div>
                  </div>

                  <div className="bg-[#121824] border border-slate-800/80 rounded-lg p-4 flex gap-3.5 items-start">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <MapPin size={14} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 tracking-wider block mb-0.5">ADDRESS</span>
                      <span className="text-xs font-semibold text-slate-200">{report.address}</span>
                    </div>
                  </div>
                </div>

                {/* Company Executive Summary */}
                {report.summary && (
                  <div className="py-6 border-b border-slate-800">
                    <h4 className="text-[10px] font-bold text-amber-500/80 tracking-wider font-mono uppercase mb-3">
                      Executive Summary
                    </h4>
                    <p className="text-slate-300 text-xs md:text-[13px] leading-relaxed font-sans font-medium text-justify">
                      {report.summary}
                    </p>
                  </div>
                )}

                {/* Products and Services */}
                {report.products && report.products.length > 0 && (
                  <div className="py-6 border-b border-slate-800">
                    <h4 className="text-[10px] font-bold text-amber-500/80 tracking-wider font-mono uppercase mb-3.5">
                      Products & Services
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {report.products.map((product, idx) => (
                        <span 
                          key={idx}
                          className="px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/50 text-[11px] font-semibold text-slate-300 select-none"
                        >
                          {product}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Pain Points */}
                {report.painPoints && report.painPoints.length > 0 && (
                  <div className="py-6 border-b border-slate-800">
                    <h4 className="text-[10px] font-bold text-amber-500/80 tracking-wider font-mono uppercase mb-4">
                      AI-Generated Pain Points
                    </h4>
                    <ul className="flex flex-col gap-3 font-sans">
                      {report.painPoints.map((point, idx) => (
                        <li key={idx} className="flex gap-2.5 items-start text-xs md:text-[13px] leading-relaxed text-slate-300">
                          <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Competitors List */}
                {report.competitors && report.competitors.length > 0 && (
                  <div className="pt-6">
                    <h4 className="text-[10px] font-bold text-amber-500/80 tracking-wider font-mono uppercase mb-4">
                      Competitors
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {report.competitors.map((comp, idx) => (
                        <div 
                          key={idx}
                          className="bg-[#121824]/50 border border-slate-800 rounded-lg p-3.5 flex justify-between items-center transition hover:border-slate-700/60"
                        >
                          <span className="text-[13px] font-bold text-slate-200">{comp.name}</span>
                          <a 
                            href={comp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
                          >
                            Visit Link
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Action Buttons Section */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-[#0c101b] border border-slate-800/80 rounded-xl p-5 shadow-lg">
                
                {/* Download PDF Trigger */}
                <a
                  href={`${API_BASE}/api/pdf/${report.pdfFilename}`}
                  download
                  className="w-full sm:w-auto px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-[#0b0f17] text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 cursor-pointer transition select-none"
                >
                  <Download size={14} />
                  Download PDF Report
                </a>

                {/* Discord Upload Trigger */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  {discordStatus === 'sent' && (
                    <span className="px-3.5 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 select-none animate-fadeIn">
                      <Check size={14} />
                      Sent to Discord
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
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                      >
                        Retry Discord Send
                      </button>
                      <span className="text-[10px] text-red-400 font-medium">{discordError}</span>
                    </div>
                  )}
                  {discordStatus === 'idle' && (
                    <button
                      onClick={() => sendToDiscord()}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-indigo-600/30 hover:border-indigo-600 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition duration-200 active:scale-[0.98]"
                    >
                      Share to Discord
                    </button>
                  )}
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Bottom Input Area Container */}
        <div className="p-8 border-t border-[#161c2a] bg-[#0b0f17] shrink-0">
          <div className="max-w-[750px] w-full mx-auto flex flex-col gap-2">
            
            {/* Input Wrapper */}
            <div className="relative flex items-center bg-[#111622] border border-slate-800 hover:border-slate-700 focus-within:border-amber-500/50 rounded-xl p-3.5 shadow-xl transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a company name (e.g. Stripe) or website URL (e.g. https://stripe.com)..."
                disabled={researchState === 'searching'}
                rows={1}
                className="flex-1 outline-none resize-none bg-transparent text-sm text-slate-100 placeholder-slate-600 h-[24px] pr-28 select-text"
              />

              {/* Research Trigger Button */}
              <button
                onClick={startResearch}
                disabled={researchState === 'searching' || !query.trim()}
                className="absolute right-3.5 py-1.5 px-4 bg-amber-500 disabled:bg-slate-800 text-[#0b0f17] disabled:text-slate-600 text-xs font-bold rounded-lg transition duration-200 cursor-pointer disabled:cursor-not-allowed hover:bg-amber-600 active:scale-[0.97] flex items-center gap-1"
              >
                {researchState === 'searching' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Running
                  </>
                ) : (
                  'Research →'
                )}
              </button>
            </div>

            {/* Input bar subtext */}
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-600 tracking-wider font-semibold select-none px-1">
              <span>ENTER TO RESEARCH · SHIFT+ENTER FOR NEW LINE</span>
              {researchState === 'searching' && <span>DO NOT REFRESH OR CLOSE WINDOW</span>}
            </div>

          </div>
        </div>

      </main>

    </div>
  );
}
