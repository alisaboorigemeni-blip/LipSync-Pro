import React, { useState, useEffect, useRef } from 'react';
import { checkHealth, fetchModels, analyzeAudio, getJobStatus, WhisperModel, JobStatus, AnalysisResult } from './api/client';
import { Settings, Play, Pause, FastForward, Upload, ChevronDown, Check, Activity, FileJson, Search, Sliders, Hash, Loader2 } from 'lucide-react';
import { SettingsPanel } from './components/SettingsPanel';
import { AudioUploader } from './components/AudioUploader';
import { TimelineView } from './components/TimelineView';
import { JsonViewer } from './components/JsonViewer';

export const LocalWhisperApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'debug' | 'json'>('timeline');
  const [showSettings, setShowSettings] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  
  const [models, setModels] = useState<WhisperModel[]>([]);
  
  // Job Config
  const [model, setModel] = useState('small');
  const [language, setLanguage] = useState('English');
  const [interval, setIntervalVal] = useState(40);
  const [smoothing, setSmoothing] = useState(true);
  const [device, setDevice] = useState('Auto');
  
  // Processing State
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const backendRef = useRef<any>(null);

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const animationRef = useRef<number>(0);

  const connect = () => {
    setBackendStatus('checking');
    if (backendRef.current) backendRef.current.close();
    
    import('./api/client').then(({ connectBackend }) => {
      backendRef.current = connectBackend(
          (message) => {
              switch (message.type) {
                  case "health":
                      setBackendStatus('connected');
                      break;
                  case "models":
                      setModels(message.models);
                      break;
                  case "accepted":
                  case "status":
                      setJobStatus(message.job);
                      break;
                  case "result":
                      setResult(message.result);
                      setJobStatus(null);
                      if (message.result.duration) setAudioDuration(message.result.duration);
                      break;
                  case "error":
                      alert(`Job error: ${message.error}`);
                      setJobStatus(null);
                      break;
              }
          },
          () => setBackendStatus('offline')
      );
    });
  };

  useEffect(() => {
    connect();
    
    return () => {
        if (backendRef.current) backendRef.current.close();
    };
  }, []);

  const checkConnection = () => connect();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setResult(null);
    setJobStatus(null);
    setCurrentTime(0);
    
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration);
    });
  };

  const handleAnalyze = () => {
    if (!selectedFile || !backendRef.current) return;
    setJobStatus({ id: 'starting', status: 'pending', stage: 'Preparing audio', progress: 0 });
    setResult(null);
    backendRef.current.analyze(selectedFile, { model, language, interval, smoothing, device });
  };

  // Player Sync
  const syncTime = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(syncTime);
      }
    }
  };

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play();
      animationRef.current = requestAnimationFrame(syncTime);
    } else {
      audioRef.current?.pause();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);
  
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  
  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const currentViseme = result?.visemes.find(v => {
    const start = v.start ?? v.time ?? 0;
    const end = v.end ?? (start + result.interval / 1000);
    return currentTime >= start && currentTime <= end;
  });

  return (
    <div className="flex h-full w-full bg-transparent text-white font-sans overflow-hidden">
      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}
      
      {/* Left Sidebar - Config & Audio */}
      <div className="w-80 flex flex-col border-r border-white/10 bg-white/[0.02] backdrop-blur-[20px] overflow-y-auto shrink-0">
        <div className="px-5 pt-6 pb-3 flex justify-between items-center">
          <h2 className="text-[0.75rem] font-semibold text-white/40 flex items-center gap-2 uppercase tracking-[0.05em] m-0">
            <Activity size={14} className="text-[#007AFF]" /> Whisper Config
          </h2>
          <button onClick={() => setShowSettings(!showSettings)} className="text-white/30 hover:text-white p-1 rounded transition-colors" title="Whisper Settings">
            <Settings size={14} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] text-white/40 mb-2 uppercase tracking-[0.05em]">Audio</label>
            <AudioUploader onFileSelect={handleFileSelect} selectedFile={selectedFile} duration={audioDuration} />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[11px] text-white/40 mb-2 uppercase tracking-[0.05em]">Whisper Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-lg p-[10px] pr-10 text-[13px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                <option value="tiny" className="bg-[#1e1e1e] text-white">Tiny</option>
                <option value="base" className="bg-[#1e1e1e] text-white">Base</option>
                <option value="small" className="bg-[#1e1e1e] text-white">Small</option>
                <option value="medium" className="bg-[#1e1e1e] text-white">Medium</option>
                <option value="large" className="bg-[#1e1e1e] text-white">Large</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-white/40 mb-2 uppercase tracking-[0.05em]">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-lg p-[10px] pr-10 text-[13px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                <option value="Auto" className="bg-[#1e1e1e] text-white">Auto</option>
                <option value="English" className="bg-[#1e1e1e] text-white">English</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-white/40 mb-2 uppercase tracking-[0.05em]">Interval</label>
              <select value={interval} onChange={e => setIntervalVal(Number(e.target.value))} className="w-full bg-white/[0.05] border border-white/10 rounded-lg p-[10px] pr-10 text-[13px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                <option value={20} className="bg-[#1e1e1e] text-white">20 ms</option>
                <option value={40} className="bg-[#1e1e1e] text-white">40 ms</option>
                <option value={50} className="bg-[#1e1e1e] text-white">50 ms</option>
                <option value={100} className="bg-[#1e1e1e] text-white">100 ms</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-white/40 mb-2 uppercase tracking-[0.05em]">Device</label>
              <select value={device} onChange={e => setDevice(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-lg p-[10px] pr-10 text-[13px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                <option value="Auto" className="bg-[#1e1e1e] text-white">Auto</option>
                <option value="CPU" className="bg-[#1e1e1e] text-white">CPU</option>
                <option value="CUDA" className="bg-[#1e1e1e] text-white">CUDA</option>
                <option value="MPS" className="bg-[#1e1e1e] text-white">MPS</option>
              </select>
            </div>

            <label className="flex items-center gap-2.5 text-[13px] text-white/80 cursor-pointer">
              <input type="checkbox" checked={smoothing} onChange={e => setSmoothing(e.target.checked)} className="rounded border-white/10 bg-white/5 accent-[#007AFF] w-4 h-4" />
              Viseme smoothing
            </label>
          </div>
        </div>

        <div className="mt-auto p-6 bg-white/[0.02] border-t border-white/10">
          <button 
            onClick={handleAnalyze} 
            disabled={!selectedFile || jobStatus?.status === 'processing' || jobStatus?.status === 'pending' || backendStatus !== 'connected'}
            className="w-full p-3 bg-[#007AFF] text-white rounded-[10px] font-semibold text-[14px] shadow-[0_8px_24px_rgba(0,122,255,0.3)] disabled:bg-white/5 disabled:text-white/20 disabled:shadow-none transition-all"
          >
            {jobStatus?.status === 'processing' || jobStatus?.status === 'pending' ? 'Analyzing...' : 'Analyze Audio'}
          </button>
          
          <div className="flex justify-between items-center text-[10px] text-white/30 mt-4 uppercase tracking-[0.05em]">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${backendStatus === 'connected' ? 'bg-[#34C759]' : backendStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-[#FF3B30]'}`} />
              {backendStatus === 'connected' ? 'Backend Connected' : backendStatus === 'checking' ? 'Checking...' : 'Backend Offline'}
            </div>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[radial-gradient(circle_at_center,#111_0%,#000_100%)]">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} models={models} onCheckConnection={checkConnection} />
        ) : (
          <>
            {/* Top Toolbar / Player */}
            <div className="h-16 bg-black/30 backdrop-blur-[20px] border-b border-white/10 flex items-center px-8 gap-6 shrink-0">
               <button onClick={togglePlay} disabled={!selectedFile} className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black border-none cursor-pointer transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
               </button>
               
               <div className="flex-1 flex items-center gap-6">
                 <span className="font-mono text-[11px] text-white/40">{currentTime.toFixed(2)}s</span>
                 
                 <div className="flex-1 relative h-1 bg-white/10 rounded-full cursor-pointer group" onClick={e => {
                    if (!audioDuration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    handleSeek(percent * audioDuration);
                 }}>
                    <div className="absolute top-0 left-0 h-full bg-[#007AFF] rounded-full" style={{ width: `${audioDuration ? (currentTime / audioDuration) * 100 : 0}%` }} />
                 </div>
                 
                 <span className="font-mono text-[11px] text-white/40">{audioDuration.toFixed(2)}s</span>
               </div>
               
               <div className="flex items-center gap-4 ml-3">
                 <div className="flex items-center gap-3">
                   <span className="text-[10px] text-white/30 font-semibold tracking-wide">VOL</span>
                   <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))} className="w-[60px] accent-white cursor-pointer h-1 bg-white/10 rounded-lg appearance-none" />
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-[10px] text-white/30 font-semibold tracking-wide">SPEED</span>
                   <select value={playbackRate} onChange={e => setPlaybackRate(Number(e.target.value))} className="bg-transparent border-none text-[11px] font-mono text-white/60 focus:ring-0 cursor-pointer outline-none appearance-none pr-4 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[position:right_center] bg-no-repeat">
                      <option value={0.5} className="bg-[#1e1e1e]">0.5x</option>
                      <option value={0.75} className="bg-[#1e1e1e]">0.75x</option>
                      <option value={1} className="bg-[#1e1e1e]">1x</option>
                      <option value={1.25} className="bg-[#1e1e1e]">1.25x</option>
                      <option value={1.5} className="bg-[#1e1e1e]">1.5x</option>
                      <option value={2} className="bg-[#1e1e1e]">2x</option>
                   </select>
                 </div>
               </div>
            </div>

            {/* Content Tabs */}
            <div className="flex px-5 border-b border-white/10 bg-black/20 shrink-0">
               {[
                 { id: 'timeline', label: 'Timeline', icon: Sliders },
                 { id: 'debug', label: 'Debug', icon: Hash },
                 { id: 'json', label: 'JSON', icon: FileJson },
               ].map(tab => (
                 <button
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as any)}
                   className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                     activeTab === tab.id 
                       ? 'border-[#007AFF] text-[#007AFF]' 
                       : 'border-transparent text-white/40 hover:text-white/60'
                   }`}
                 >
                   <tab.icon size={14} />
                   {tab.label}
                 </button>
               ))}
            </div>

            {/* Main Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
              {jobStatus && jobStatus.status !== 'completed' && jobStatus.status !== 'failed' && (
                <div className="absolute inset-0 z-10 bg-[#1e1e1e]/80 backdrop-blur-sm flex items-center justify-center">
                   <div className="bg-[#252526] border border-zinc-800 rounded-lg p-6 w-96 shadow-xl">
                      <h3 className="text-zinc-100 font-medium mb-4 flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-blue-500" />
                        Processing audio
                      </h3>
                      
                      <div className="space-y-2 mb-6 text-sm">
                        {['Preparing audio', 'Transcribing', 'Aligning phonemes', 'Mapping visemes', 'Generating timeline'].map(step => {
                          const isDone = jobStatus.progress > 0 && jobStatus.stage !== step; 
                          const isCurrent = jobStatus.stage === step;
                          return (
                            <div key={step} className={`flex items-center gap-2 ${isDone ? 'text-emerald-500' : isCurrent ? 'text-blue-400' : 'text-zinc-600'}`}>
                              {isDone ? <Check size={14} /> : isCurrent ? <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-700" />}
                              <span>{step}</span>
                            </div>
                          )
                        })}
                      </div>
                      
                      <div className="w-full bg-[#3c3c3c] h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${jobStatus.progress}%` }} />
                      </div>
                      <div className="text-right text-xs text-zinc-500 mt-2">{jobStatus.progress}%</div>
                   </div>
                </div>
              )}

              {result ? (
                <>
                  {activeTab === 'timeline' && <TimelineView result={result} currentTime={currentTime} onSeek={handleSeek} audioDuration={audioDuration} currentViseme={currentViseme} />}
                  {activeTab === 'json' && <JsonViewer result={result} />}
                  {activeTab === 'debug' && (
                    <div className="flex-1 p-6 overflow-auto bg-[#1e1e1e]">
                       <div className="grid grid-cols-3 gap-6">
                          <div>
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Words</h3>
                            <div className="space-y-1 font-mono text-xs">
                               {result.words?.map((w, i) => (
                                 <div key={i} className="flex gap-4 p-1 hover:bg-[#2a2a2b] rounded">
                                   <span className="text-zinc-500 w-24">{w.start.toFixed(2)} → {w.end.toFixed(2)}</span>
                                   <span className="text-zinc-300">{w.word}</span>
                                 </div>
                               )) || <div className="text-zinc-600">No word data</div>}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Phonemes</h3>
                            <div className="space-y-1 font-mono text-xs">
                               {result.phonemes?.map((p, i) => (
                                 <div key={i} className="flex gap-4 p-1 hover:bg-[#2a2a2b] rounded">
                                   <span className="text-zinc-500 w-24">{p.start.toFixed(2)} → {p.end.toFixed(2)}</span>
                                   <span className="text-emerald-400">{p.phoneme}</span>
                                 </div>
                               )) || <div className="text-zinc-600">No phoneme data</div>}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Visemes</h3>
                            <div className="space-y-1 font-mono text-xs">
                               {result.visemes.map((v, i) => {
                                 const start = v.start ?? v.time ?? 0;
                                 const end = v.end ?? (start + result.interval / 1000);
                                 return (
                                   <div key={i} className="flex gap-4 p-1 hover:bg-[#2a2a2b] rounded">
                                     <span className="text-zinc-500 w-24">{start.toFixed(2)} → {end.toFixed(2)}</span>
                                     <span className={v.viseme === 'sil' ? 'text-zinc-600' : 'text-blue-400 font-bold'}>{v.viseme}</span>
                                   </div>
                                 )
                               })}
                            </div>
                          </div>
                       </div>
                    </div>
                  )}
                </>
              ) : (
                 <div className="flex-1 flex items-center justify-center text-white/20 flex-col gap-4">
                    {!selectedFile ? (
                      <>
                        <Upload size={48} className="opacity-30" />
                        <p className="text-[14px] tracking-[-0.01em]">Select an audio file to begin</p>
                      </>
                    ) : (
                      <>
                        <Activity size={48} className="opacity-30" />
                        <p className="text-[14px] tracking-[-0.01em]">Ready to analyze</p>
                      </>
                    )}
                 </div>
              )}
            </div>
            
            {/* Bottom Status Bar */}
            {result && activeTab === 'timeline' && (
              <div className="h-16 border-t border-zinc-800 bg-[#252526] px-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">Current Viseme</span>
                    <span className={`text-lg font-mono font-bold ${currentViseme?.viseme === 'sil' ? 'text-zinc-500' : 'text-blue-400'}`}>
                      {currentViseme?.viseme || 'SILENCE'}
                    </span>
                  </div>
                  {currentViseme?.viseme !== 'sil' && (
                    <div className="flex flex-col border-l border-zinc-700 pl-4">
                      <span className="text-[10px] text-zinc-500 font-semibold uppercase">Time</span>
                      <span className="text-sm font-mono text-zinc-300">
                        {((currentViseme?.start ?? currentViseme?.time ?? 0)).toFixed(2)}s
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-6 text-sm text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Analysis complete
                  </div>
                  <span>{result.visemes.length} events</span>
                  <span>{result.interval}ms interval</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
