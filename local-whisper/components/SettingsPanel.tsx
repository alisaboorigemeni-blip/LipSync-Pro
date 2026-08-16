import React, { useState } from 'react';
import { WhisperModel } from '../api/client';
import { X, Server, Download, CheckCircle2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  models: WhisperModel[];
  onCheckConnection: () => void;
}

export const SettingsPanel: React.FC<Props> = ({ onClose, models, onCheckConnection }) => {
  const [url, setUrl] = useState(localStorage.getItem('whisper_backend_url') || 'http://localhost:8000');

  const handleSaveUrl = () => {
    localStorage.setItem('whisper_backend_url', url);
    onCheckConnection();
  };

  return (
    <div className="flex-1 p-8 bg-[#1e1e1e] overflow-y-auto relative">
      <button onClick={onClose} className="absolute top-8 right-8 text-zinc-400 hover:text-white p-2 rounded hover:bg-zinc-800">
        <X size={20} />
      </button>
      
      <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
        <Server size={24} className="text-blue-500" /> Settings
      </h2>
      
      <div className="max-w-2xl space-y-8">
        <div className="bg-[#252526] border border-zinc-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Backend Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Backend URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  className="flex-1 bg-[#3c3c3c] border border-zinc-700 rounded p-2 text-zinc-100 font-mono text-sm focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleSaveUrl} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium">
                  Update
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Ensure the local FastAPI backend is running on this address.</p>
            </div>
          </div>
        </div>

        <div className="bg-[#252526] border border-zinc-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Whisper Models</h3>
          <div className="space-y-2">
            {models.length > 0 ? models.map(m => (
              <div key={m.name} className="flex items-center justify-between p-3 bg-[#1e1e1e] border border-zinc-800 rounded">
                <span className="text-sm font-medium font-mono text-zinc-300">{m.name}</span>
                {m.installed ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    <CheckCircle2 size={14} /> Installed
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Download size={14} /> Available
                  </span>
                )}
              </div>
            )) : (
              <div className="text-sm text-zinc-500 p-4 border border-dashed border-zinc-800 rounded text-center">
                Could not load models from backend.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
