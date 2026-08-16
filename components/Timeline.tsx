import React, { useRef, useEffect, useState } from 'react';
import { VisemeEvent, Viseme } from '../types';
import { Play, Pause, Square, ZoomIn, ZoomOut, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

interface TimelineProps {
  duration: number; // seconds
  currentTime: number;
  visemes: VisemeEvent[];
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onScrub: (time: number) => void;
  audioBuffer: AudioBuffer | null; // Waveform data
  onOffsetVisemes: (amount: number) => void; // New prop for offset
}

export const Timeline: React.FC<TimelineProps> = ({ 
  duration, 
  currentTime, 
  visemes, 
  isPlaying, 
  onPlayPause, 
  onStop, 
  onScrub,
  audioBuffer,
  onOffsetVisemes
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visemeCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  // Initialize width
  useEffect(() => {
    const updateWidth = () => {
      if (outerRef.current) {
        setContainerWidth(outerRef.current.clientWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 20)); // Max 20x
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 1)); // Min 1x

  const totalWidth = Math.max(containerWidth * zoom, containerWidth);

  // Handle Scrubbing
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!innerRef.current || duration === 0) return;
    const rect = innerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    onScrub(percentage * duration);
  };

  // Auto-scroll logic
  useEffect(() => {
    if (isPlaying && outerRef.current && totalWidth > containerWidth) {
      const scrollLeft = outerRef.current.scrollLeft;
      const playheadPos = (currentTime / duration) * totalWidth;
      
      // If playhead moves near the right edge of view, scroll forward
      if (playheadPos > scrollLeft + containerWidth * 0.9) {
        outerRef.current.scrollTo({
          left: playheadPos - containerWidth * 0.2, 
          behavior: 'smooth'
        });
      } 
      // If playhead jumps back (loop), scroll back
      else if (playheadPos < scrollLeft) {
        outerRef.current.scrollTo({
          left: playheadPos - containerWidth * 0.1, 
          behavior: 'auto'
        });
      }
    }
  }, [currentTime, isPlaying, duration, totalWidth, containerWidth]);

  // Draw Visemes
  useEffect(() => {
    const canvas = visemeCanvasRef.current;
    if (!canvas || totalWidth === 0 || duration === 0 || visemes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== Math.floor(totalWidth)) {
        canvas.width = Math.floor(totalWidth);
    }
    const height = canvas.height;
    
    ctx.clearRect(0, 0, totalWidth, height);

    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw all visemes (Canvas handles clipping outside bounds automatically)
    for (let i = 0; i < visemes.length; i++) {
       const evt = visemes[i];
       if (!evt || evt.viseme === Viseme.SIL) continue;
       
       const left = (evt.start / duration) * totalWidth;
       const width = ((evt.end - evt.start) / duration) * totalWidth;
       
       // Draw box
       const boxTop = 12; // top-3
       const boxHeight = 32; // h-8
       
       ctx.fillStyle = 'rgba(245, 158, 11, 0.5)'; // bg-amber-500/50
       ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // border-white-700 equivalent
       ctx.lineWidth = 1;

       ctx.beginPath();
       ctx.roundRect(left, boxTop, width, boxHeight, 6);
       ctx.fill();
       ctx.stroke();

       // Draw text
       if (width > 15) {
           ctx.fillStyle = '#ffffff';
           ctx.fillText(evt.viseme.toUpperCase(), left + width / 2, boxTop + boxHeight / 2);
       }
    }

  }, [visemes, totalWidth, duration]);

  // Draw Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || totalWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Explicitly set canvas dimensions for sharpness
    if (canvas.width !== Math.floor(totalWidth)) {
        canvas.width = Math.floor(totalWidth);
    }
    const height = canvas.height;
    
    ctx.clearRect(0, 0, totalWidth, height);
    
    const data = audioBuffer.getChannelData(0); // Left channel
    
    // Improved sampling logic for zooming
    // Map pixels to audio samples
    const samplesPerPixel = data.length / totalWidth;
    
    // Amplitude scaling
    const amp = height * 0.4; 
    const centerY = height * 0.6; 

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    
    ctx.strokeStyle = '#a1a1aa'; // Zinc 400
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Optimization: Draw chunks
    // When zoomed out (samplesPerPixel > 1): Find min/max in chunk
    // When zoomed in (samplesPerPixel < 1): Interpolate or step
    
    // We iterate pixels (x) to draw the line
    for (let x = 0; x < totalWidth; x++) {
       const startSample = Math.floor(x * samplesPerPixel);
       const endSample = Math.floor((x + 1) * samplesPerPixel);
       
       let min = 1.0;
       let max = -1.0;
       
       // Single sample case (High zoom)
       if (endSample <= startSample) {
           const val = data[startSample] || 0;
           min = val; max = val;
       } else {
           // Aggregation case (Zoom out)
           // Limit loop for performance on huge files if needed, but linear scan is usually fast enough for UI
           const step = Math.max(1, Math.floor((endSample - startSample) / 10)); // Optimization check
           for (let i = startSample; i < endSample; i += step) {
               const val = data[i];
               if (val < min) min = val;
               if (val > max) max = val;
           }
       }
       
       // Silence fallback
       if (min > max) { min = 0; max = 0; }

       const yMin = centerY + (min * amp);
       const yMax = centerY + (max * amp);

       ctx.lineTo(x, yMin);
       ctx.lineTo(x, yMax);
    }
    
    ctx.stroke();

  }, [audioBuffer, totalWidth, zoom]);

  return (
    <div className="w-full bg-zinc-900 border-t border-zinc-800 p-4 flex flex-col gap-3 select-none">
      {/* Controls Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Playback Controls */}
          <button 
            onClick={onPlayPause}
            className="flex items-center justify-center w-10 h-10 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <button 
            onClick={onStop}
            className="flex items-center justify-center w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-all active:scale-95"
            title="Stop / Reset"
          >
            <Square size={16} fill="currentColor" />
          </button>

          <div className="w-px h-8 bg-zinc-800 mx-1" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button 
              onClick={handleZoomOut}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
              disabled={zoom <= 1}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-[10px] font-mono text-zinc-500 w-12 text-center select-none">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button 
              onClick={handleZoomIn}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
              disabled={zoom >= 20}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="w-px h-8 bg-zinc-800 mx-1" />

          {/* Sync Correction Controls */}
          <div className="flex items-center gap-2 px-2 py-1 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
             <div className="flex flex-col leading-none">
               <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Sync Offset</span>
               <span className="text-[9px] text-zinc-600">Global Adjustment</span>
             </div>
             <div className="flex gap-1">
               <button 
                 onClick={() => onOffsetVisemes(-0.1)} 
                 className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 rounded border border-zinc-800 transition-colors"
                 title="Shift Left (Earlier) by 0.1s"
               >
                 <ChevronsLeft size={14} />
               </button>
               <button 
                 onClick={() => onOffsetVisemes(-0.01)} 
                 className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 rounded border border-zinc-800 transition-colors"
                 title="Shift Left (Earlier) by 0.01s"
               >
                 <ChevronLeft size={14} />
               </button>
               <button 
                 onClick={() => onOffsetVisemes(0.01)} 
                 className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 rounded border border-zinc-800 transition-colors"
                 title="Shift Right (Later) by 0.01s"
               >
                 <ChevronRight size={14} />
               </button>
               <button 
                 onClick={() => onOffsetVisemes(0.1)} 
                 className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 rounded border border-zinc-800 transition-colors"
                 title="Shift Right (Later) by 0.1s"
               >
                 <ChevronsRight size={14} />
               </button>
             </div>
          </div>

        </div>

        <div className="text-zinc-400 font-mono text-xs bg-zinc-950 px-3 py-1.5 rounded-md border border-zinc-800">
          <span className="text-zinc-200 font-semibold">{currentTime.toFixed(2)}s</span> 
          <span className="opacity-50 mx-1">/</span> 
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>

      {/* Scrollable Container */}
      <div 
        ref={outerRef}
        className="relative w-full overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-inner custom-scrollbar"
      >
        {/* Scalable Inner Track */}
        <div 
          ref={innerRef}
          className="relative h-40 cursor-pointer group"
          style={{ width: `${totalWidth}px`, minWidth: '100%' }}
          onClick={handleTimelineClick}
        >
          
          {/* Layer 1: Audio Waveform (Background) */}
          <canvas 
            ref={canvasRef}
            width={totalWidth} 
            height={200}
            className="absolute inset-0 w-full h-full opacity-100 pointer-events-none"
          />

          {/* Layer 2: Visemes (Foreground Overlay) */}
          <canvas 
            ref={visemeCanvasRef}
            width={totalWidth} 
            height={200}
            className="absolute inset-0 w-full h-full opacity-100 pointer-events-none z-20"
          />

          {/* Global: Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute -top-1 -left-[5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-red-500" />
          </div>
          
          {/* Hover Effect */}
          <div className="absolute inset-0 hover:bg-white/5 transition-colors pointer-events-none" />
        </div>
      </div>
    </div>
  );
};