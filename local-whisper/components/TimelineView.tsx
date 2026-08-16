import React, { useState, useRef, useEffect } from 'react';
import { AnalysisResult, VisemeEvent } from '../api/client';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  result: AnalysisResult;
  currentTime: number;
  onSeek: (time: number) => void;
  audioDuration: number;
  currentViseme: VisemeEvent | undefined;
}

export const TimelineView: React.FC<Props> = ({ result, currentTime, onSeek, audioDuration, currentViseme }) => {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 20));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 1));
  const handleResetZoom = () => setZoom(1);

  const pxPerSecond = 100 * zoom;
  const totalWidth = audioDuration * pxPerSecond;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const newTime = clickX / pxPerSecond;
    onSeek(Math.max(0, Math.min(newTime, audioDuration)));
  };

  useEffect(() => {
    if (containerRef.current && isPlayingRef.current) {
        // Auto-scroll logic if needed
        const container = containerRef.current;
        const playheadX = currentTime * pxPerSecond;
        if (playheadX > container.scrollLeft + container.clientWidth * 0.8) {
            container.scrollLeft = playheadX - container.clientWidth * 0.2;
        } else if (playheadX < container.scrollLeft) {
            container.scrollLeft = playheadX - container.clientWidth * 0.2;
        }
    }
  }, [currentTime, pxPerSecond]);

  const isPlayingRef = useRef(false);
  useEffect(() => {
      const p = currentTime > 0;
      isPlayingRef.current = p;
  }, [currentTime]);

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e]">
       <div className="h-12 border-b border-zinc-800 bg-[#252526] flex items-center px-4 justify-between">
          <span className="text-xs font-semibold text-zinc-500 uppercase">Viseme Timeline</span>
          <div className="flex items-center gap-1 bg-[#1e1e1e] rounded border border-zinc-700 p-0.5">
             <button onClick={handleZoomOut} className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"><ZoomOut size={14} /></button>
             <button onClick={handleResetZoom} className="px-2 text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-700 rounded">{Math.round(zoom * 100)}%</button>
             <button onClick={handleZoomIn} className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"><ZoomIn size={14} /></button>
          </div>
       </div>
       
       <div className="flex-1 relative overflow-x-auto overflow-y-hidden select-none" ref={containerRef}>
          <div className="absolute top-0 left-0 h-full min-w-full" style={{ width: totalWidth, minWidth: '100%' }} onClick={handleTimelineClick}>
             {/* Time Ruler */}
             <div className="h-6 border-b border-zinc-800 relative bg-[#2a2a2b] opacity-80 pointer-events-none">
                {Array.from({ length: Math.ceil(audioDuration) }).map((_, i) => (
                   <div key={i} className="absolute top-0 text-[9px] text-zinc-500 font-mono border-l border-zinc-700 pl-1 h-full" style={{ left: i * pxPerSecond }}>
                     {i}s
                   </div>
                ))}
             </div>
             
             {/* Timeline Tracks */}
             <div className="relative h-[calc(100%-24px)] pointer-events-none mt-4">
                {result.visemes.map((v, i) => {
                   const start = v.start ?? v.time ?? 0;
                   const end = v.end ?? (start + result.interval / 1000);
                   const isSil = v.viseme === 'sil';
                   const left = start * pxPerSecond;
                   const width = Math.max(1, (end - start) * pxPerSecond);
                   
                   return (
                     <div 
                       key={i} 
                       className={`absolute top-0 h-16 border-r border-[#1e1e1e] flex items-center justify-center overflow-hidden
                         ${isSil ? 'bg-zinc-800/50' : 'bg-blue-900/40 border-y border-blue-800/50'}
                       `}
                       style={{ left, width }}
                       title={`${v.viseme} (${start.toFixed(2)}s - ${end.toFixed(2)}s)`}
                     >
                        {!isSil && width > 20 && (
                          <span className="text-xs font-bold text-blue-300">{v.viseme}</span>
                        )}
                     </div>
                   );
                })}
                
                {/* Playhead */}
                <div 
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-10 before:content-[''] before:absolute before:top-[-4px] before:-left-1 before:w-2 before:h-2 before:bg-red-500 before:rounded-full pointer-events-none transition-transform duration-75"
                  style={{ transform: `translateX(${currentTime * pxPerSecond}px)` }}
                />
             </div>
          </div>
       </div>
    </div>
  );
};
