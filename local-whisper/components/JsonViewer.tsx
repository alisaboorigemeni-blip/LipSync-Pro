import React, { useState } from 'react';
import { AnalysisResult } from '../api/client';
import { Copy, Download, Check } from 'lucide-react';

interface Props {
  result: AnalysisResult;
}

export const JsonViewer: React.FC<Props> = ({ result }) => {
  const [copied, setCopied] = useState(false);
  
  const jsonStr = JSON.stringify(result, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visemes_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e]">
       <div className="h-12 border-b border-zinc-800 bg-[#252526] flex items-center px-4 justify-between">
          <span className="text-xs font-semibold text-zinc-500 uppercase">JSON Export</span>
          <div className="flex items-center gap-2">
             <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
             </button>
             <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded transition-colors">
                <Download size={14} /> Download
             </button>
          </div>
       </div>
       <div className="flex-1 overflow-auto p-4">
          <pre className="text-[11px] font-mono text-emerald-400 bg-[#1e1e1e]">
            {jsonStr}
          </pre>
       </div>
    </div>
  );
};
