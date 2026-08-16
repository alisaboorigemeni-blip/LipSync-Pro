import React from 'react';
import { ShapeKeyMapping, MeshInfo } from '../types';
import { VISEMES_LIST } from '../constants';
import { Sparkles, Eye, Loader2 } from 'lucide-react';

interface MappingPanelProps {
  meshInfo: MeshInfo | null;
  mapping: ShapeKeyMapping;
  onMappingChange: (visemeId: string, shapeKey: string | null) => void;
  onPreviewShape: (shapeKey: string, val: number) => void;
  onAutoMap?: () => void;
  isAnalyzing?: boolean;
  analyzingMessage?: string;
}

export const MappingPanel: React.FC<MappingPanelProps> = ({ 
  meshInfo, 
  mapping, 
  onMappingChange, 
  onPreviewShape, 
  onAutoMap,
  isAnalyzing = false,
  analyzingMessage = "Analyzing..."
}) => {
  if (!meshInfo) {
    return (
      <div className="flex flex-col items-center justify-center text-zinc-500 text-sm py-12 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/50">
        <p className="font-medium mb-1">No Mesh Loaded</p>
        <p className="text-xs opacity-50">Upload a model to start mapping</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 min-h-[300px]">
      {/* Loading Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 z-20 bg-zinc-900/70 backdrop-blur-sm rounded-lg flex justify-center pt-32 transition-all duration-300">
          <div className="sticky top-32 flex flex-col items-center text-center p-6 space-y-3">
             <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                <Loader2 className="relative z-10 animate-spin text-indigo-400" size={32} />
             </div>
             <p className="text-sm font-medium text-indigo-200 animate-pulse">{analyzingMessage}</p>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between pb-2 border-b border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Viseme Mapping</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">Link phonemes to shape keys</p>
        </div>
        {onAutoMap && (
          <button 
            onClick={onAutoMap}
            disabled={isAnalyzing}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/20 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Automatically map shape keys"
          >
            <Sparkles size={14} className="group-hover:text-indigo-300 transition-colors" />
            <span>Auto-Map</span>
          </button>
        )}
      </div>

      <div className={`space-y-3 transition-opacity duration-300 ${isAnalyzing ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        {VISEMES_LIST.map((viseme) => {
          const assignedKey = mapping[viseme.id] || "";
          const isAssigned = !!assignedKey;
          
          return (
            <div 
              key={viseme.id} 
              className={`
                group relative rounded-lg p-3 border transition-all duration-200
                ${isAssigned 
                  ? 'bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600' 
                  : 'bg-red-500/5 border-red-500/20 hover:border-red-500/30'
                }
              `}
            >
              {/* Header Row */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold tracking-wide ${isAssigned ? 'text-zinc-300' : 'text-red-400'}`}>
                    {viseme.label}
                  </span>
                  <code className="text-[9px] text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                    {viseme.id}
                  </code>
                </div>
                <div className="text-[10px] text-zinc-600 truncate max-w-[100px] text-right">
                  {viseme.description}
                </div>
              </div>
              
              {/* Controls Row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select 
                    value={assignedKey}
                    onChange={(e) => onMappingChange(viseme.id, e.target.value || null)}
                    className={`
                      w-full appearance-none text-xs rounded-md pl-2.5 pr-7 py-2 transition-colors focus:outline-none focus:ring-1
                      ${isAssigned 
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300 focus:ring-indigo-500/50 focus:border-indigo-500/50' 
                        : 'bg-zinc-900 border-red-900/30 text-zinc-500 focus:ring-red-500/30'
                      }
                    `}
                  >
                    <option value="">Select Shape Key...</option>
                    {meshInfo.shapeKeys.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  {/* Custom Chevron */}
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>

                <button
                  onMouseDown={() => assignedKey && onPreviewShape(assignedKey, 1.0)}
                  onMouseUp={() => assignedKey && onPreviewShape(assignedKey, 0)}
                  onMouseLeave={() => assignedKey && onPreviewShape(assignedKey, 0)}
                  disabled={!assignedKey}
                  className={`
                    px-3 rounded-md border transition-all flex items-center justify-center
                    ${assignedKey 
                      ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-300 hover:text-white cursor-pointer' 
                      : 'bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed'
                    }
                  `}
                  title="Press and hold to preview shape key"
                >
                  <Eye size={14} />
                </button>
              </div>
              
              {!isAssigned && (
                <div className="absolute -right-1 -top-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};