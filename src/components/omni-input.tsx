'use client';

import { useState, useRef, useCallback } from 'react';
import {
  FileText,
  Image as ImageIcon,
  MessageSquare,
  UploadCloud,
  X,
  Loader2,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { type InputMode, type ProcessingStage } from '@/lib/types';
import { type JobState } from '@/lib/useJobTracking';

interface OmniInputProps {
  onSubmit: (formData: FormData, mode: InputMode) => Promise<void>;
  stage: ProcessingStage;
  jobState?: JobState | null;
}

export default function OmniInput({ onSubmit, stage, jobState }: OmniInputProps) {
  const [mode, setMode] = useState<InputMode>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = ['EXTRACTING', 'AI_PROCESSING', 'VALIDATING'].includes(stage);

  const tabs: { id: InputMode; label: string; icon: React.ReactNode }[] = [
    { id: 'pdf', label: 'Upload PDF', icon: <FileText size={18} /> },
    { id: 'image', label: 'Screenshot', icon: <ImageIcon size={18} /> },
    { id: 'text', label: 'Quick Text', icon: <MessageSquare size={18} /> },
  ];

  const acceptMap: Record<InputMode, string> = {
    pdf: '.pdf',
    image: '.png,.jpg,.jpeg,.webp',
    text: '',
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (isProcessing) return;

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (mode === 'pdf' && file.type === 'application/pdf') {
        setSelectedFile(file);
      } else if (mode === 'image' && file.type.startsWith('image/')) {
        setSelectedFile(file);
      }
    },
    [isProcessing, mode]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (isProcessing) return;

    const fd = new FormData();

    if (mode === 'pdf' && selectedFile) {
      fd.append('pdf', selectedFile);
    } else if (mode === 'image' && selectedFile) {
      fd.append('image', selectedFile);
    } else if (mode === 'text' && textInput.trim()) {
      fd.append('text', textInput.trim());
    } else {
      return; // nothing to submit
    }

    await onSubmit(fd, mode);
  };

  const canSubmit =
    !isProcessing &&
    ((mode === 'text' && textInput.trim().length > 0) ||
      ((mode === 'pdf' || mode === 'image') && selectedFile !== null));

  // Loading state overlay
  if (isProcessing) {
    const messages: Record<string, { title: string; sub: string }> = {
      EXTRACTING: {
        title:
          mode === 'pdf'
            ? 'Gemma is reading your syllabus...'
            : mode === 'image'
              ? 'Gemma is reading your announcement...'
              : 'Gemma is understanding your text...',
        sub: 'Extracting semantic content',
      },
      AI_PROCESSING: {
        title: 'Gemma is understanding your academic information...',
        sub: 'Finding deadlines, changes, and important constraints...',
      },
      VALIDATING: {
        title: 'Checking extracted events...',
        sub: 'Validating and normalizing constraints...',
      },
    };
    const msg = messages[stage] || messages.AI_PROCESSING;

    return (
      <div className="card py-12 px-6 max-w-lg mx-auto text-center animate-fade-in-up bg-black/40 backdrop-blur-xl border-white/10 shadow-[0_0_30px_rgba(79,125,245,0.1)] relative flex flex-col items-center justify-center">
        
        {/* Custom Loading SVG Animation */}
        <div className="mx-auto mb-4 flex justify-center items-center drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]">
          <svg width="150" height="150" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <style>
              {`
                .outer-ring {
                  transform-origin: 50px 50px;
                  animation: rotateRight 10s linear infinite;
                }
                .outer-ring-reverse {
                  transform-origin: 50px 50px;
                  animation: rotateLeft 15s linear infinite;
                }
                .inner-star {
                  transform-origin: 50px 50px;
                  animation: pulse 2s ease-in-out infinite alternate;
                  filter: drop-shadow(0 0 2px rgba(138, 180, 248, 0.8));
                }
                
                @keyframes rotateRight {
                  100% { transform: rotate(360deg); }
                }
                @keyframes rotateLeft {
                  100% { transform: rotate(-360deg); }
                }
                @keyframes pulse {
                  0% { transform: scale(0.95); opacity: 0.7; }
                  100% { transform: scale(1.05); opacity: 1; }
                }
              `}
            </style>

            {/* Crosshairs */}
            <line x1="50" y1="5" x2="50" y2="95" stroke="#8ab4f8" strokeWidth="0.5" strokeDasharray="1 2" opacity="0.6"/>
            <line x1="5" y1="50" x2="95" y2="50" stroke="#8ab4f8" strokeWidth="0.5" strokeDasharray="1 2" opacity="0.6"/>
            
            {/* Outer Dotted Rings */}
            <circle cx="50" cy="50" r="35" stroke="#8ab4f8" strokeWidth="0.75" strokeDasharray="1 3" fill="none" className="outer-ring"/>
            <circle cx="50" cy="50" r="45" stroke="#8ab4f8" strokeWidth="0.5" strokeDasharray="0.5 4" fill="none" className="outer-ring-reverse"/>
            
            {/* Central Geometric Star (Astroid) */}
            <path d="M 50 20 C 50 40 40 50 20 50 C 40 50 50 60 50 80 C 50 60 60 50 80 50 C 60 50 50 40 50 20 Z" 
                  fill="rgba(138, 180, 248, 0.1)" 
                  stroke="#8ab4f8" 
                  strokeWidth="1" 
                  className="inner-star"/>
          </svg>
        </div>
        
        {/* Foreground Content */}
        <div className="relative z-10 w-full">
          <h3 className="text-xl font-semibold mb-2 flex items-center justify-center gap-2 text-white/90">
            <Sparkles size={18} className="text-[#8b5cf6]" />
            {msg.title}
          </h3>
          <p className="text-[#94a3b8] text-sm">
            {jobState ? jobState.currentStep : msg.sub}
          </p>
          
          {/* Progress Bar Container (Always Visible) */}
          <div className="mt-6 w-64 mx-auto bg-gray-800/80 rounded-full h-1.5 overflow-hidden backdrop-blur-sm border border-white/5">
            {jobState ? (
              <div 
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                style={{ width: `${jobState.progress}%` }}
              />
            ) : (
              <div 
                className="bg-blue-500/50 h-1.5 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse"
                style={{ width: '100%' }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden animate-fade-in-up">
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setMode(tab.id);
              clearFile();
              setTextInput('');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors relative"
            style={{
              color: mode === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: mode === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
            }}
            aria-selected={mode === tab.id}
            role="tab"
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="p-6">
        {/* File upload modes */}
        {(mode === 'pdf' || mode === 'image') && (
          <>
            {!selectedFile ? (
              <div
                className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors"
                style={{
                  borderColor: isDragging ? 'var(--accent-blue)' : 'var(--border-subtle)',
                  backgroundColor: isDragging ? 'rgba(79,125,245,0.05)' : 'transparent',
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label={`Upload ${mode === 'pdf' ? 'PDF' : 'image'} file`}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <input
                  id="hidden-file-input"
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept={acceptMap[mode]}
                  onChange={handleFileChange}
                />
                <UploadCloud
                  size={40}
                  className="mx-auto mb-4"
                  style={{ color: 'var(--text-muted)' }}
                />
                <p className="text-lg font-medium mb-1">
                  {mode === 'pdf' ? 'Upload your syllabus' : 'Upload announcement screenshot'}
                </p>
                <p style={{ color: 'var(--text-muted)' }} className="text-sm">
                  Drag & drop or click to browse
                </p>
                <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-3">
                  {mode === 'pdf' ? 'Supports: .pdf (Max 10MB)' : 'Supports: .png, .jpg, .webp (Max 5MB)'}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'rgba(79,125,245,0.1)' }}
                  >
                    {mode === 'pdf' ? (
                      <FileText size={24} style={{ color: 'var(--accent-blue)' }} />
                    ) : (
                      <ImageIcon size={24} style={{ color: 'var(--accent-blue)' }} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{selectedFile.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {selectedFile.size < 1024 
                        ? `${selectedFile.size} B`
                        : selectedFile.size < 1024 * 1024 
                          ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                          : `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearFile}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  aria-label="Remove file"
                >
                  <X size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            )}
          </>
        )}

        {/* Text mode */}
        {mode === 'text' && (
          <div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={`Paste or type your academic info here...\n\nExample: "CS301 midterm is next Friday and assignment 4 is due Monday."`}
              className="w-full rounded-xl p-4 text-sm resize-none border focus:outline-none focus:ring-2 transition-all"
              style={{
                backgroundColor: 'var(--bg-card-hover)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
                minHeight: '140px',
              }}
              maxLength={10000}
            />
            <p className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
              {textInput.length} / 10,000
            </p>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full mt-4 py-3 px-6 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: canSubmit ? 'var(--ai-gradient-blue)' : 'var(--border-subtle)',
            color: canSubmit ? '#121317' : '#fff',
          }}
        >
          <Sparkles size={18} />
          Sync My Schedule
        </button>

        {/* Demo Button */}
        <button
          onClick={() => {
             setTextInput("KAKATIYA UNIVERSITY COLLEGE OF ENGINEERING DEPARTMENT OF COMPUTER SCIENCE CIRCULAR - ODD SEMESTER 2026\n\nAll B.Tech 3rd-year students are hereby informed that the academic schedule has been slightly revised due to the recent holidays. The Mid-Semester-1 Examinations will commence on August 28, 2026. The detailed subject-wise timetable will be released shortly.\n\nFurthermore, the final submission for the Database Management Systems (DBMS) Lab Record is strictly scheduled for September 2, 2026. No late submissions will be entertained.\n\nThe mini-project abstract submission, originally scheduled for last week, is now extended to September 10, 2026. Please coordinate with your respective guides.");
             setMode('text');
          }}
          className="w-full mt-3 py-2 px-6 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border border-white/10 hover:bg-white/5 text-gray-400 opacity-60 hover:opacity-100"
        >
          Try a sample notice
        </button>
      </div>
    </div>
  );
}
