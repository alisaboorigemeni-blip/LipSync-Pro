
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Viewport } from './components/Viewport';
import { MappingPanel } from './components/MappingPanel';
import { Timeline } from './components/Timeline';
import { MeshInfo, ShapeKeyMapping, VisemeEvent } from './types';
import { generateVisemesFromAudio } from './services/geminiService';
import { generateAIMapping } from './services/aiMappingService'; 
import { generateLocalMapping } from './services/localMappingService';
import { createAnimationClip, exportGLB } from './services/exportService';
import { createVideoRecorder, VideoRecorder } from './services/videoService'; // Import Video Service
import { Upload, Mic, Download, Loader2, FileAudio, Square, Box, Video, X, RefreshCw, AudioLines, Settings, FileJson } from 'lucide-react'; 
import { LocalWhisperApp } from './local-whisper/LocalWhisperApp';

// --- HELPER: Trim Silence & Normalize ---
const trimSilence = async (blob: Blob, audioCtx: AudioContext): Promise<Blob | null> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/audioWorker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
            if (e.data.type === 'TRIM_SILENCE_RESULT') {
                if (e.data.payload) {
                    const outBlob = new Blob([e.data.payload], { type: 'audio/wav' });
                    resolve(outBlob);
                } else {
                    resolve(null);
                }
                worker.terminate();
            }
        };

        worker.postMessage({
            type: 'TRIM_SILENCE',
            payload: { channelData, sampleRate }
        });
    });
};

// --- Code-Based Volume Gating ---
const calculateRMS = (buffer: AudioBuffer, start: number, end: number): number => {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(Math.max(0, start) * sampleRate);
  const endSample = Math.floor(Math.min(buffer.duration, end) * sampleRate);
  
  if (endSample <= startSample) return 0;

  const channelData = buffer.getChannelData(0); 
  let sumSquares = 0;
  const length = endSample - startSample;
  
  const step = Math.ceil(length / 1000); 
  let count = 0;

  for (let i = startSample; i < endSample; i += step) {
    if (i < channelData.length) {
      const val = channelData[i];
      sumSquares += val * val;
      count++;
    }
  }

  if (count === 0) return 0;
  return Math.sqrt(sumSquares / count);
};

// --- Energy Snapping & Pre-Sound Anticipation ---
const refineVisemeTimings = (visemes: VisemeEvent[], buffer: AudioBuffer): VisemeEvent[] => {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  return visemes.map(v => {
    let newStart = v.start;
    const isPlosive = ['pp', 'b', 'p', 'm', 'kk', 'g', 'dd', 't', 'nn'].some(s => v.viseme.toLowerCase().includes(s));
    const anticipation = isPlosive ? 0.08 : 0.02;
    newStart = Math.max(0, newStart - anticipation);

    const windowRadius = 0.1;
    const startIdx = Math.floor(Math.max(0, newStart - windowRadius) * sampleRate);
    const endIdx = Math.floor(Math.min(buffer.duration, newStart + windowRadius) * sampleRate);
    
    let localPeak = 0;
    for (let i = startIdx; i < endIdx; i += 50) {
      if (i < channelData.length) {
        localPeak = Math.max(localPeak, Math.abs(channelData[i]));
      }
    }

    if (localPeak > 0.02) { 
      const threshold = localPeak * 0.15;
      let attackTime = -1;

      for (let i = startIdx; i < endIdx; i += 10) {
        if (Math.abs(channelData[i]) > threshold) {
          attackTime = i / sampleRate;
          break;
        }
      }
      if (attackTime !== -1) {
        newStart = Math.max(0, attackTime - anticipation);
      }
    }

    return {
      ...v,
      start: newStart,
      end: Math.max(newStart + 0.06, v.end)
    };
  });
};

const LipSyncPro: React.FC<{ engine?: 'gemini' | 'local' }> = ({ engine = 'gemini' }) => {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);
  const [loadedMesh, setLoadedMesh] = useState<THREE.Mesh | null>(null);
  const [modelRoot, setModelRoot] = useState<THREE.Group | THREE.Scene | null>(null);
  const [mapping, setMapping] = useState<ShapeKeyMapping>({});
  
  // Audio State
  const [currentAudioFile, setCurrentAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [visemes, setVisemes] = useState<VisemeEvent[]>([]);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Video Export State
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // We need a ref to the ACTIVE recorder to stop it via the Cancel button
  const exportRecorderRef = useRef<VideoRecorder | null>(null);
  
  // State for generic processing
  const [isProcessing, setIsProcessing] = useState(false);
  
  // State specifically for Mesh Analysis
  const [isAnalyzingMesh, setIsAnalyzingMesh] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewWeights, setPreviewWeights] = useState<{ [key: string]: number }>({});
  const [calculatedWeights, setCalculatedWeights] = useState<{ [key: string]: number }>({});

  // Local Whisper Config State
  const [whisperModel, setWhisperModel] = useState('small');
  const [whisperLanguage, setWhisperLanguage] = useState('Auto');
  const [whisperInterval, setWhisperInterval] = useState(40);
  const [whisperDevice, setWhisperDevice] = useState('Auto');
  const [whisperSmoothing, setWhisperSmoothing] = useState(true);


  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<number>(0);
  
  // Refs used for the Video Export animation loop
  const exportStartTimeRef = useRef(0);
  const exportAudioCtxRef = useRef<AudioContext | null>(null);
  const playbackStartTimeRef = useRef(0);

  const effectiveDuration = audioDuration > 0 ? audioDuration : (visemes.length > 0 ? visemes.reduce((max, v) => Math.max(max, v.end), 0) : 1);
  
  const localBackendRef = useRef<any>(null);
  const analysisResolveRef = useRef<((result: VisemeEvent[]) => void) | null>(null);
  const analysisRejectRef = useRef<((reason: any) => void) | null>(null);

  useEffect(() => {
    if (engine === 'local') {
        import('./local-whisper/api/client').then(({ connectBackend }) => {
            localBackendRef.current = connectBackend(
                (message) => {
                    switch (message.type) {
                        case "status":
                        case "accepted":
                            setProgressMsg(message.job.stage || "Processing audio...");
                            break;
                        case "result":
                            const visemes = message.result.visemes.map((v: any) => ({
                                start: v.start ?? v.time ?? 0,
                                end: v.end ?? ((v.start ?? v.time ?? 0) + message.result.interval / 1000),
                                viseme: v.viseme,
                                strength: 1.0
                            })) as VisemeEvent[];
                            if (analysisResolveRef.current) {
                                analysisResolveRef.current(visemes);
                                analysisResolveRef.current = null;
                                analysisRejectRef.current = null;
                            }
                            break;
                        case "error":
                            if (analysisRejectRef.current) {
                                analysisRejectRef.current(new Error(message.error));
                                analysisRejectRef.current = null;
                                analysisResolveRef.current = null;
                            } else {
                                alert(`Local Whisper Error: ${message.error}`);
                            }
                            break;
                    }
                },
                () => {}
            );
        });
        return () => {
            if (localBackendRef.current) {
                localBackendRef.current.close();
                localBackendRef.current = null;
            }
        };
    }
  }, [engine]);

  // --- AudioContext Persistence Ref ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended by browser policy
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // --- Object URL Lifecycle Management ---
  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl);
    };
  }, [modelUrl]);

  // --- AI/Local Mapping ---
  const performAIMapping = async (shapeKeys: string[]) => {
    setIsAnalyzingMesh(true);
    if (engine === 'gemini') {
      setProgressMsg("Analyzing shape keys with AI...");
      try {
        const aiMapping = await generateAIMapping(shapeKeys, (msg) => setProgressMsg(msg));
        setMapping(aiMapping);
        setProgressMsg("AI mapping completed!");
        setTimeout(() => setIsAnalyzingMesh(false), 1000);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        alert(`AI Mapping failed: ${errorMessage}`);
        setIsAnalyzingMesh(false);
      }
    } else {
      setProgressMsg("Mapping shape keys locally...");
      try {
        const localMapping = generateLocalMapping(shapeKeys);
        setMapping(localMapping);
        setProgressMsg("Local mapping completed!");
        setTimeout(() => setIsAnalyzingMesh(false), 500);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        alert(`Local Mapping failed: ${errorMessage}`);
        setIsAnalyzingMesh(false);
      }
    }
  };

  // --- Unified Audio Processing Helper ---
  const processAudioFile = async (file: File) => {
      // Immediate UI Feedback: reset duration and buffer so timeline reflects loading
      setAudioDuration(0);
      setAudioBuffer(null);
      setVisemes([]);
      setCurrentTime(0);
      setIsPlaying(false);

      setCurrentAudioFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFileName(file.name);
      
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        setAudioDuration(audio.duration);
      });
      audioRef.current = audio;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = getAudioCtx(); // Use persistent context
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        setAudioBuffer(decoded);
      } catch (err) {
        console.error("Error decoding audio for waveform:", err);
      }
  };

  // --- Handlers: File Uploads ---
  const handleMeshUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
        alert("Only .glb or .gltf files are supported.");
        return;
      }
      
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setMeshInfo(null);
      setLoadedMesh(null);
      setModelRoot(null);
      setMapping({});
      
      // RESET INPUT so the same file can be re-selected
      e.target.value = '';
    }
  };

  const handleLoadSample = () => {
    if (modelUrl === 'exampleMesh.glb') return;
    setModelUrl('exampleMesh.glb');
    setMeshInfo(null);
    setLoadedMesh(null);
    setModelRoot(null);
    setMapping({});
  };

  const onMeshLoadedHandler = (info: MeshInfo, mesh: THREE.Mesh) => {
    setMeshInfo(info);
    setLoadedMesh(mesh);
    performAIMapping(info.shapeKeys);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processAudioFile(file);
      // RESET INPUT so the same file can be re-selected
      e.target.value = '';
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProgressMsg("Loading and parsing visemes...");
    setIsProcessing(true); // Optional: if you want a loading state

    const reader = new FileReader();
    reader.onload = (event) => {
      const jsonString = event.target?.result as string;
      
      const worker = new Worker(new URL('./workers/jsonWorker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (msgEvent) => {
        const { type, payload, error } = msgEvent.data;
        if (type === 'PARSE_VISEMES_SUCCESS') {
          setVisemes(payload);
          setProgressMsg("Visemes loaded successfully!");
        } else if (type === 'PARSE_VISEMES_ERROR') {
          alert(error);
          setProgressMsg("Error loading visemes.");
        }
        setIsProcessing(false);
        worker.terminate();
      };

      worker.onerror = (err) => {
        alert("Worker error occurred while parsing JSON.");
        setIsProcessing(false);
        worker.terminate();
      };

      worker.postMessage({
        type: 'PARSE_VISEMES',
        payload: { jsonString }
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          setIsProcessing(true);
          setProgressMsg("Processing audio...");
          try {
             const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
             const audioCtx = getAudioCtx(); // Use persistent context
             const trimmedBlob = await trimSilence(blob, audioCtx);
             
             if (!trimmedBlob) {
                 alert("No voice detected. Please speak clearly.");
                 setIsProcessing(false);
                 stream.getTracks().forEach(track => track.stop());
                 return;
             }

             const file = new File([trimmedBlob], "recorded_voice.wav", { type: 'audio/wav' });
             await processAudioFile(file);
          } catch (e) {
             console.error("Recording processing error", e);
             alert("Error processing recording");
          } finally {
             setIsProcessing(false);
             stream.getTracks().forEach(track => track.stop());
          }
        };
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err: any) {
        console.error("Error accessing microphone:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             alert("Microphone access was denied. This app requires microphone permissions to record audio.");
        } else {
             alert("Could not access microphone. " + (err.message || "Please ensure permissions are granted."));
        }
      }
    }
  };

  const handleGenerate = async () => {
    const file = currentAudioFile;
    if (!file) return;

    setIsProcessing(true);
    setProgressMsg("Starting...");

    // Determine if this is a "Re-generate" action
    const isRegenerating = visemes.length > 0;
    
    // CACHE BYPASS HACK:
    // If regenerating, we create a new File instance with the current timestamp.
    // The Gemini Service uses file.lastModified as part of the cache key.
    // Changing this forces the service to treat it as a new file and call the API again.
    let fileToProcess = file;
    if (isRegenerating) {
       fileToProcess = new File([file], file.name, {
         type: file.type,
         lastModified: Date.now() 
       });
    }

    try {
      let result: VisemeEvent[];
      if (engine === 'gemini') {
        result = await generateVisemesFromAudio(fileToProcess, (msg) => setProgressMsg(msg), audioDuration);
      } else {
        setProgressMsg("Uploading to local Whisper...");
        if (!localBackendRef.current) {
            throw new Error("Local backend not connected.");
        }
        result = await new Promise<VisemeEvent[]>((resolve, reject) => {
            analysisResolveRef.current = resolve;
            analysisRejectRef.current = reject;
            localBackendRef.current.analyze(fileToProcess, {
                model: whisperModel,
                language: whisperLanguage,
                interval: whisperInterval,
                smoothing: whisperSmoothing,
                device: whisperDevice
            });
        });
      }
      
      if (audioBuffer) {
        setProgressMsg("Syncing with waveform...");
        result = refineVisemeTimings(result, audioBuffer);
        setProgressMsg("Filtering silence...");
        const silenceThreshold = 0.005;
        result = result.filter(v => calculateRMS(audioBuffer, v.start, v.end) > silenceThreshold);
      }
      setVisemes(result);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      alert(`Error generating lip sync: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOffsetVisemes = (offset: number) => {
    setVisemes(prev => prev.map(v => {
      const newStart = Math.max(0, v.start + offset);
      const newEnd = Math.max(newStart + 0.01, v.end + offset);
      return { ...v, start: newStart, end: newEnd };
    }));
  };

  const updateAnimation = useCallback((time: number) => {
    const currentViseme = visemes.find(v => time >= v.start && time <= v.end);
    const newWeights: {[key:string]: number} = {};
    if (currentViseme) {
      const shapeKey = mapping[currentViseme.viseme];
      if (shapeKey) {
         const duration = currentViseme.end - currentViseme.start;
         const localT = time - currentViseme.start;
         const strength = currentViseme.strength;
         const fadeTime = Math.min(0.05, duration * 0.2);
         let alpha = 1.0;
         if (localT < fadeTime) alpha = localT / fadeTime;
         else if (localT > duration - fadeTime) alpha = (duration - localT) / fadeTime;
         newWeights[shapeKey] = strength * alpha;
      }
    }
    setCalculatedWeights(newWeights);
  }, [visemes, mapping]);

  // --- REFACTORED: Animation Loop ---
  const animate = () => {
    if (!isPlaying && !isExportingVideo) return;

    let elapsed = 0;
    let shouldStop = false;

    if (isExportingVideo) {
      // MODE 1: EXPORTING
      // During export, time is driven by the VideoService's Audio Context
      if (exportAudioCtxRef.current) {
        // Precise time from the dedicated recording audio context
        elapsed = exportAudioCtxRef.current.currentTime;
      } else {
        // Fallback (should ideally not happen)
        elapsed = (performance.now() - exportStartTimeRef.current) / 1000;
      }
      
      if (elapsed >= audioDuration) {
        shouldStop = true;
      }
    } else {
      // MODE 2: PLAYBACK (Sync Fix Applied)
      // We rely on the Audio Element's currentTime as the "Master Clock".
      // This handles hardware latency automatically. 
      // If audio is "warming up", currentTime stays 0, and lips stay closed.
      if (audioUrl && audioRef.current) {
        elapsed = audioRef.current.currentTime;
        if (audioRef.current.paused && !audioRef.current.ended && elapsed === 0) {
           // Wait for it to start
        } else if (audioRef.current.ended || elapsed >= audioDuration) {
           shouldStop = true;
        }
      } else {
        // Fallback: Viseme-only playback (no audio loaded)
        elapsed = (performance.now() - playbackStartTimeRef.current) / 1000;
        if (elapsed >= effectiveDuration) {
           shouldStop = true;
        }
      }
    }

    if (shouldStop) {
       // Stop logic is handled by the caller/effect hooks usually, 
       // but here we trigger the state update.
       // For Export, we let the handleExportVideo function handle the cleanup promise.
       if (!isExportingVideo) {
         setIsPlaying(false);
         setCurrentTime(0);
       }
       // Don't return here for Export mode, let the loop run one last frame to be safe
       if (!isExportingVideo) return; 
    }

    setCurrentTime(elapsed);
    updateAnimation(elapsed);
    
    // Only continue loop if we haven't stopped (check again for safety)
    if ((isExportingVideo && !shouldStop) || (isPlaying && !shouldStop)) {
       requestRef.current = requestAnimationFrame(animate);
    }
  };

  // --- Effect: Playback Control ---
  useEffect(() => {
    if (isPlaying && !isExportingVideo) {
      // 1. Start Audio or Set Reference Time
      const audio = audioRef.current;
      if (audioUrl && audio) {
        audio.currentTime = currentTime;
        audio.play().catch(console.error);
      } else {
        playbackStartTimeRef.current = performance.now() - (currentTime * 1000);
      }
      // 2. Start Visual Loop
      requestRef.current = requestAnimationFrame(animate);
    } else if (!isPlaying && !isExportingVideo) {
      // Stop/Pause
      const audio = audioRef.current;
      if (audioUrl && audio) audio.pause();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isExportingVideo]); 
  // Dependency note: We exclude 'animate' to avoid re-binds. 
  // We added isExportingVideo to ensure normal playback stops when export starts.

  const handleScrub = (time: number) => {
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
    playbackStartTimeRef.current = performance.now() - (time * 1000);
    updateAnimation(time);
  };

  const handleExport = async () => {
    if (!loadedMesh || !modelRoot || visemes.length === 0) return;
    setIsProcessing(true);
    setProgressMsg("Generating GLB...");
    setTimeout(async () => {
      try {
        const clip = createAnimationClip(visemes, mapping, audioDuration);
        await exportGLB(modelRoot, clip, loadedMesh.name);
      } catch (e: unknown) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        alert("Export failed: " + errorMessage);
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  // --- NEW: Handle Video Export ---
  const handleExportVideo = async () => {
    if (!canvasRef.current || !audioBuffer || visemes.length === 0) {
      alert("Please ensure model, audio, and lip sync are ready.");
      return;
    }

    setIsExportingVideo(true);
    setIsPlaying(false); // Stop normal playback if running
    setCurrentTime(0);   // Reset to start

    // --- KEY CHANGE: Wait for React & Canvas to resize ---
    // The Viewport component will detect `isExportingVideo=true` and boost the DPR.
    // We wait 500ms to ensure the GL buffer is resized before starting capture.
    setTimeout(async () => {
      if (!canvasRef.current) return;

      const recorder = createVideoRecorder(canvasRef.current, audioBuffer);
      exportRecorderRef.current = recorder; // Store ref for cancellation
      exportAudioCtxRef.current = recorder.getAudioContext();
      exportStartTimeRef.current = performance.now();

      // Start Recording Service (await ensure context is resumed)
      await recorder.start();

      // Start our custom animation loop for the export
      const exportLoop = () => {
        // Get precise time from the recorder's audio context
        const ctx = recorder.getAudioContext();
        
        // Safety: If context closed/invalid, stop
        if (!ctx || ctx.state === 'closed') {
          finishExport();
          return;
        }
        
        const t = ctx.currentTime;
        
        // Stop when finished
        if (t >= audioDuration) {
           finishExport();
           return;
        }

        setCurrentTime(t);
        updateAnimation(t);
        requestRef.current = requestAnimationFrame(exportLoop);
      };
      requestRef.current = requestAnimationFrame(exportLoop);

      const finishExport = async () => {
         if (requestRef.current) cancelAnimationFrame(requestRef.current);
         
         // Force a final stop if loop ended
         const blob = await recorder.stop();
         
         // Download
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `lipsync_video_${new Date().getTime()}.webm`;
         a.click();
         URL.revokeObjectURL(url);

         // Reset State
         cleanupExportState();
      };
    }, 500); // 500ms delay for resolution switch
  };

  const handleCancelExport = async () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    // Stop recorder but ignore the blob
    if (exportRecorderRef.current) {
      try {
        await exportRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder on cancel", e);
      }
    }
    
    cleanupExportState();
  };

  const cleanupExportState = () => {
    setIsExportingVideo(false);
    setCurrentTime(0);
    exportAudioCtxRef.current = null;
    exportRecorderRef.current = null;
    // Reset view to normal state
    updateAnimation(0);
  };

  return (
    <div className="flex h-full w-full bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex flex-col border-r border-zinc-800 bg-zinc-900 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Mesh Upload & Sample */}
          <div className="space-y-3">
             <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
               1. Character Mesh (GLB)
             </label>
             <div className="flex gap-2">
               <div className="relative group flex-1">
                  <button className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center justify-center gap-2 text-sm transition-colors">
                    <Upload size={16} />
                    {meshInfo ? "Change" : "Upload"}
                  </button>
                  <input 
                    type="file" 
                    accept=".glb,.gltf"
                    onChange={handleMeshUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
               </div>
               <button 
                 onClick={handleLoadSample}
                 className="px-3 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded flex items-center justify-center gap-2 text-sm text-indigo-400 transition-colors"
                 title="Load a sample model to try the app"
               >
                 <Box size={16} />
                 <span>Sample</span>
               </button>
             </div>
             {meshInfo && (
               <div className="text-xs text-green-400 bg-green-900/20 p-2 rounded border border-green-900/50">
                 Loaded: {meshInfo.name} <br/>
                 Format: GLB/GLTF
               </div>
             )}
          </div>

          {/* Audio Upload */}
          <div className="space-y-3">
             <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
               2. Audio Track
             </label>
             <div className="relative group">
                <button className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center justify-center gap-2 text-sm transition-colors">
                  <Upload size={16} />
                  {audioUrl && !isRecording ? "Change Audio" : "Upload Audio"}
                </button>
                <input 
                  id="audio-upload"
                  type="file" 
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
             </div>

             <button 
               onClick={handleRecordToggle}
               className={`w-full h-10 border rounded flex items-center justify-center gap-2 text-sm transition-all
                 ${isRecording 
                   ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white animate-pulse' 
                   : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                 }
               `}
             >
               {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
               {isRecording ? "Stop Recording" : "Record Audio"}
             </button>

             <div className="relative group">
                <button className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center justify-center gap-2 text-sm transition-colors">
                  <FileJson size={16} />
                  Load Visemes JSON
                </button>
                <input 
                  id="json-upload"
                  type="file" 
                  accept=".json,application/json"
                  onChange={handleJsonUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
             </div>

             {audioFileName && (
               <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-900/20 p-2 rounded border border-indigo-900/50">
                 <FileAudio size={12} />
                 <span className="truncate">{audioFileName}</span>
               </div>
             )}

            {engine === 'local' && (
              <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Settings size={14} className="text-white/40" />
                  <span className="text-xs font-medium text-white/60 tracking-wider uppercase">Local Engine Options</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center gap-2">
                    <label className="text-[11px] text-white/40 uppercase tracking-[0.05em] w-20">Model</label>
                    <select value={whisperModel} onChange={e => setWhisperModel(e.target.value)} className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_8px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                      <option value="tiny" className="bg-[#1e1e1e]">Tiny</option>
                      <option value="base" className="bg-[#1e1e1e]">Base</option>
                      <option value="small" className="bg-[#1e1e1e]">Small</option>
                      <option value="medium" className="bg-[#1e1e1e]">Medium</option>
                      <option value="large" className="bg-[#1e1e1e]">Large</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-between items-center gap-2">
                    <label className="text-[11px] text-white/40 uppercase tracking-[0.05em] w-20">Device</label>
                    <select value={whisperDevice} onChange={e => setWhisperDevice(e.target.value)} className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_8px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                      <option value="Auto" className="bg-[#1e1e1e]">Auto</option>
                      <option value="CPU" className="bg-[#1e1e1e]">CPU</option>
                      <option value="CUDA" className="bg-[#1e1e1e]">CUDA</option>
                      <option value="MPS" className="bg-[#1e1e1e]">MPS</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <label className="text-[11px] text-white/40 uppercase tracking-[0.05em] w-20">Interval</label>
                    <select value={whisperInterval} onChange={e => setWhisperInterval(Number(e.target.value))} className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_8px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                      <option value={20} className="bg-[#1e1e1e]">20 ms</option>
                      <option value={40} className="bg-[#1e1e1e]">40 ms</option>
                      <option value={50} className="bg-[#1e1e1e]">50 ms</option>
                      <option value={100} className="bg-[#1e1e1e]">100 ms</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-between items-center gap-2">
                    <label className="text-[11px] text-white/40 uppercase tracking-[0.05em] w-20">Language</label>
                    <select value={whisperLanguage} onChange={e => setWhisperLanguage(e.target.value)} className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_8px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors">
                      <option value="Auto" className="bg-[#1e1e1e]">Auto</option>
                      <option value="English" className="bg-[#1e1e1e]">English</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2.5 text-[12px] text-white/80 cursor-pointer w-full hover:text-white transition-colors">
                      <input type="checkbox" checked={whisperSmoothing} onChange={e => setWhisperSmoothing(e.target.checked)} className="rounded border-white/10 bg-white/5 accent-[#007AFF] w-3.5 h-3.5" />
                      Viseme smoothing
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <hr className="border-zinc-800" />

          <MappingPanel 
            meshInfo={meshInfo} 
            mapping={mapping} 
            onMappingChange={(v, k) => setMapping(prev => ({ ...prev, [v]: k }))}
            onPreviewShape={(key, val) => setPreviewWeights(prev => ({ ...prev, [key]: val }))}
            onAutoMap={() => meshInfo && performAIMapping(meshInfo.shapeKeys)}
            isAnalyzing={isAnalyzingMesh}
            analyzingMessage={progressMsg}
          />
        </div>

        <div className="mt-auto p-4 bg-zinc-900 border-t border-zinc-800 space-y-3">
          {isProcessing && (
             <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 animate-pulse pb-2">
                <Loader2 size={14} className="animate-spin" />
                {progressMsg}
             </div>
          )}
          
          <button 
             onClick={handleGenerate}
             disabled={!currentAudioFile || !meshInfo || isProcessing || isAnalyzingMesh || isRecording}
             className={`w-full h-10 text-white rounded font-medium text-sm transition-colors flex items-center justify-center gap-2
               ${visemes.length > 0 
                  ? "bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800" 
                  : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800"
               }
               disabled:text-zinc-600
             `}
          >
             {visemes.length > 0 ? <RefreshCw size={16} /> : <Mic size={16} />}
             {visemes.length > 0 ? "Re-generate Lip Sync" : "Generate Lip Sync"}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button 
               onClick={handleExport}
               disabled={visemes.length === 0 || isProcessing || isAnalyzingMesh || isRecording || isExportingVideo}
               className="h-10 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors flex items-center justify-center gap-2 border border-zinc-700"
            >
               <Download size={16} />
               <span>GLB</span>
            </button>
            <button 
               onClick={handleExportVideo}
               disabled={visemes.length === 0 || isProcessing || isAnalyzingMesh || isRecording || isExportingVideo}
               className="h-10 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors flex items-center justify-center gap-2 border border-zinc-700"
               title="Record and Download Video"
            >
               <Video size={16} />
               <span>Video</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
         <div className="flex-1 relative bg-black">
            <Viewport 
              modelUrl={modelUrl}
              modelFormat='glb'
              onMeshLoaded={onMeshLoadedHandler}
              onModelRootLoaded={setModelRoot}
              currentShapeWeights={Object.values(previewWeights).some((v: number) => v > 0) ? previewWeights : calculatedWeights}
              onCanvasReady={(canvas) => canvasRef.current = canvas}
              isExportingVideo={isExportingVideo}
            />
            
            <div className="absolute top-4 right-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded border border-white/10 font-mono">
               FPS: 60
            </div>

            {/* Exporting Overlay with Cancel Button */}
            {isExportingVideo && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                 <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex flex-col items-center shadow-2xl min-w-[300px]">
                   <div className="relative mb-6 mt-2 w-20 h-20 flex items-center justify-center">
                      <div className="absolute inset-0 bg-red-500 blur-xl opacity-20 animate-pulse rounded-full" />
                      {/* Spinning Loader Border */}
                      <div className="absolute inset-0 rounded-full border-4 border-zinc-800 border-t-red-500 animate-spin" />
                      {/* Static Icon Container */}
                      <div className="relative w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center z-10">
                          <Video size={32} className="text-red-500" />
                      </div>
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">Rendering Video</h3>
                   <div className="w-full bg-zinc-800 h-1.5 rounded-full mb-2 overflow-hidden">
                       <div 
                         className="bg-red-500 h-full transition-all duration-100 ease-linear"
                         style={{ width: `${Math.min(100, (currentTime / effectiveDuration) * 100)}%` }}
                       />
                   </div>
                   <p className="text-xs text-zinc-400 mb-6 font-mono">
                      {currentTime.toFixed(1)}s / {effectiveDuration.toFixed(1)}s
                   </p>
                   
                   <button 
                     onClick={handleCancelExport}
                     className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 hover:border-red-900/50 border border-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors"
                   >
                     <X size={14} />
                     Cancel Render
                   </button>
                 </div>
              </div>
            )}
         </div>

         <Timeline 
           duration={effectiveDuration}
           currentTime={currentTime}
           visemes={visemes}
           isPlaying={isPlaying}
           onPlayPause={() => !isExportingVideo && setIsPlaying(!isPlaying)}
           onStop={() => { setIsPlaying(false); setCurrentTime(0); }}
           onScrub={handleScrub}
           audioBuffer={audioBuffer}
           onOffsetVisemes={handleOffsetVisemes} 
         />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [engine, setEngine] = useState<'gemini' | 'local'>('local');
  const [activeTab, setActiveTab] = useState<'3d' | 'generator'>('3d');
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-transparent relative text-white">
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[20px]">
          <div className="bg-black/40 border border-white/10 p-6 rounded-2xl w-[400px] shadow-2xl backdrop-blur-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-white/60" /> App Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.05em] text-white/40 mb-2">Audio Processing Engine</label>
                <select 
                  value={engine} 
                  onChange={(e) => {
                    setEngine(e.target.value as 'gemini' | 'local');
                    if (e.target.value === 'gemini') setActiveTab('3d');
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-[10px] pr-10 text-[13px] text-white focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat hover:bg-white/[0.08] transition-colors"
                >
                  <option value="gemini" className="bg-[#1e1e1e] text-white">Gemini AI Service</option>
                  <option value="local" className="bg-[#1e1e1e] text-white">Local Whisper Backend</option>
                </select>
                <p className="text-[11px] text-white/40 mt-2">
                  {engine === 'gemini' 
                    ? 'Uses cloud-based Gemini AI for viseme generation.' 
                    : 'Uses local FastAPI Whisper backend. Enables advanced generator tab.'}
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-[#007AFF] text-white rounded-[10px] text-[13px] font-semibold transition-colors shadow-[0_8px_24px_rgba(0,122,255,0.3)] hover:brightness-110">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-16 flex items-center justify-between px-6 bg-black/40 backdrop-blur-[20px] border-b border-white/10 shrink-0 z-40">
        <div className="flex flex-col">
           <h1 className="text-[1.1rem] font-semibold tracking-[-0.02em] m-0 text-white leading-tight">LipSync Pro</h1>
           <p className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-white/40 mt-0.5 m-0">Automated Shape Key Animator</p>
        </div>
        
        {engine === 'local' && (
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 absolute left-1/2 -translate-x-1/2">
             <button 
               onClick={() => setActiveTab('3d')}
               className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${activeTab === '3d' ? 'bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]' : 'text-white/50 hover:text-white/70 bg-transparent'}`}
             >
               3D Avatar
             </button>
             <button 
               onClick={() => setActiveTab('generator')}
               className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${activeTab === 'generator' ? 'bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]' : 'text-white/50 hover:text-white/70 bg-transparent'}`}
             >
               Whisper Generator
             </button>
          </div>
        )}

        <button onClick={() => setShowSettings(true)} className="text-white/40 hover:text-white transition-colors bg-transparent border-none p-2 cursor-pointer">
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative flex">
         {engine === 'gemini' ? (
           <LipSyncPro engine="gemini" />
         ) : (
           activeTab === '3d' ? <LipSyncPro engine="local" /> : <LocalWhisperApp />
         )}
      </div>
    </div>
  );
};

export default App;
