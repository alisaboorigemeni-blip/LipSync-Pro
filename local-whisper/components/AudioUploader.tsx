import React, { useRef } from 'react';
import { Upload, Music, FileAudio } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  duration: number;
}

export const AudioUploader: React.FC<Props> = ({ onFileSelect, selectedFile, duration }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div 
      className="border border-dashed border-white/10 rounded-2xl py-10 px-5 text-center cursor-pointer bg-white/[0.03] transition-all hover:bg-white/[0.06] hover:border-[#007AFF]"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input type="file" accept="audio/*" ref={inputRef} onChange={handleChange} className="hidden" />
      
      {selectedFile ? (
        <div className="flex flex-col items-center gap-2">
          <FileAudio size={24} className="text-[#007AFF] mb-3" />
          <div className="text-[13px] text-white/60 truncate w-full px-2">{selectedFile.name}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/40 mt-2 text-left">
            <span>Duration:</span><span className="text-white/80 font-mono">{duration ? duration.toFixed(2) + 's' : '...'}</span>
            <span>Size:</span><span className="text-white/80 font-mono">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload size={24} className="text-[#007AFF] mb-3" />
          <div className="text-[13px] text-white/60">Drop file here or click to browse</div>
          <div className="text-[9px] text-white/20 uppercase mt-2">MP3 · WAV · M4A · FLAC · OGG</div>
        </div>
      )}
    </div>
  );
};
