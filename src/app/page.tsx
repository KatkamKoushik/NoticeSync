'use client';

import { useState, useCallback, useEffect } from 'react';
import { Bell, Zap, Shield, ArrowRight, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import OmniInput from '@/components/omni-input';
import ReviewEvent from '@/components/review-event';
import Planner from '@/components/planner';
import AIBackground from '@/components/ai-background';
import type { AcademicEvent, ProcessingStage, InputMode } from '@/lib/types';
import { useJobTracking } from '@/lib/useJobTracking';

type AppView = 'input' | 'review' | 'success' | 'planner';

export default function Home() {
  const [view, setView] = useState<AppView>('input');
  const [stage, setStage] = useState<ProcessingStage>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<AcademicEvent[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<AcademicEvent[]>([]);
  const [lastConfirmed, setLastConfirmed] = useState<AcademicEvent[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const jobState = useJobTracking(activeJobId);

  // Sync job state with local UI stage when processing
  useEffect(() => {
    if (jobState) {
      if (jobState.status === 'failed') {
        setError(jobState.errorMessage || 'Processing failed.');
        setStage('ERROR');
        setActiveJobId(null);
      }
    }
  }, [jobState]);

  const handleSubmit = useCallback(async (formData: FormData, mode: InputMode) => {
    setError(null);
    setStage('EXTRACTING');
    
    try {
      // Demo Mode Support
      if (typeof window !== 'undefined' && window.location.search.includes('demo=true')) {
        await new Promise(r => setTimeout(r, 1000));
        setStage('AI_PROCESSING');
        await new Promise(r => setTimeout(r, 1500));
        setStage('VALIDATING');
        await new Promise(r => setTimeout(r, 1000));
        
        const demoEvents: AcademicEvent[] = [
          {
            id: 'demo-1',
            title: 'Artificial Intelligence Mid-1',
            date: '2026-08-25T10:00:00Z',
            type: 'exam',
            description: 'Mid-1 Exam for AI. Postponed until further notice.',
            confidence: 0.95,
            importance: 'high',
            strictDeadline: true,
            deadlineChange: 'postponed',
            additionalInformationPending: true,
            needsReview: true
          },
          {
            id: 'demo-2',
            title: 'Data Warehousing Lab Record',
            date: '2026-09-02T16:00:00Z',
            type: 'assignment',
            description: 'Lab record submission deadline.',
            confidence: 0.9,
            importance: 'medium',
            strictDeadline: true,
            deadlineChange: 'none',
            additionalInformationPending: false,
            needsReview: false
          }
        ];
        
        setExtractedEvents(demoEvents);
        setStage('REVIEW');
        setView('review');
        return;
      }

      // 1. Create Job
      const jobRes = await fetch('/api/jobs', { method: 'POST' });
      const jobData = await jobRes.json();
      if (!jobRes.ok) throw new Error(jobData.error || 'Failed to initialize job');
      
      const jobId = jobData.jobId;
      setActiveJobId(jobId);
      
      formData.append('jobId', jobId);

      setStage('AI_PROCESSING');

      // 2. Start Processing
      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process your input.');
      }

      setStage('VALIDATING');
      await new Promise((r) => setTimeout(r, 400)); // UI polish buffer

      const events: AcademicEvent[] = data.events || [];

      if (events.length === 0) {
        setError(
          data.message || 'Gemma could not extract any dated academic events from this content.'
        );
        setStage('ERROR');
        setActiveJobId(null);
        return;
      }

      setExtractedEvents(events);
      setStage('REVIEW');
      setView('review');
      setActiveJobId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      setStage('ERROR');
      setActiveJobId(null);
    }
  }, []);

  const handleConfirmEvents = (events: AcademicEvent[]) => {
    setConfirmedEvents((prev) => [...prev, ...events]);
    setLastConfirmed(events);
    setView('success');
    setStage('SUCCESS');
    
    // Auto transition to planner after 3.5 seconds
    setTimeout(() => {
      setView('planner');
      // Keep stage as SUCCESS for the background pulse to gracefully fade, 
      // or change to IDLE if preferred. IDLE is fine.
      setStage('IDLE');
    }, 3500);
  };

  const handleAddMore = () => {
    setView('input');
    setStage('IDLE');
    setError(null);
    setExtractedEvents([]);
  };

  const isProcessing = ['EXTRACTING', 'AI_PROCESSING', 'VALIDATING'].includes(stage);

  return (
    <>
      <AIBackground isProcessing={isProcessing} isSuccess={stage === 'SUCCESS'} />
      <div className="min-h-screen flex flex-col relative z-10">
        {/* Header */}
        <header
          className="px-6 py-4 bg-[#121317] sticky top-0 z-50"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 shadow-[0_0_15px_rgba(79,125,245,0.1)]"
              >
                <Bell size={18} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white/90">NoticeSync</span>
            </div>
            
            {/* Elegant Gemma Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-[#4f7df5]/30 backdrop-blur-md shadow-[0_0_10px_rgba(79,125,245,0.15)]">
              <Sparkles size={14} className="text-[#4f7df5]" />
              <span className="text-xs font-medium text-white/80">Powered by Gemma</span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 py-8 md:py-16">
          <div className="max-w-4xl mx-auto">
            {/* Input view */}
            {view === 'input' && (
              <div className="space-y-8">
                {/* Hero */}
                {stage === 'IDLE' && confirmedEvents.length === 0 && (
                  <div className="text-center mb-16 mt-8 animate-fade-in-up">
                    <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 text-white" style={{ letterSpacing: '-0.04em' }}>
                      NoticeSync
                    </h1>
                    <p className="text-xl sm:text-2xl max-w-2xl mx-auto text-[#f8f9fc] mb-8 font-normal" style={{ letterSpacing: '-0.01em' }}>
                      Turn scattered notices into one clear plan.
                    </p>

                    {/* Feature pills (styled like Gemma action buttons) */}
                    <div className="flex flex-wrap justify-center gap-4 mt-8 mb-12">
                      {[
                        { icon: <Zap size={16} />, text: 'Upload Syllabi' },
                        { icon: <Sparkles size={16} />, text: 'AI Extraction' },
                        { icon: <ArrowRight size={16} />, text: 'Calendar Sync' },
                      ].map((f, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (i === 2) {
                              alert("Extract events first before syncing to calendar!");
                            } else {
                              document.getElementById('hidden-file-input')?.click();
                            }
                          }}
                          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-colors cursor-pointer active:scale-95 ${
                            i === 0 
                              ? 'bg-white text-[#121317] hover:bg-gray-200' 
                              : 'border border-white/20 text-white hover:bg-white/10'
                          }`}
                        >
                          {f.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Returning header */}
                {confirmedEvents.length > 0 && stage === 'IDLE' && (
                  <div className="text-center mb-6 animate-fade-in-up">
                    <h2 className="text-2xl font-bold text-white/90">Add more events</h2>
                    <p className="text-sm mt-2 text-[#94a3b8]">
                      Upload another syllabus, screenshot, or paste text.
                    </p>
                  </div>
                )}

                <div id="omni-input-section" className="max-w-2xl mx-auto">
                  <OmniInput 
              onSubmit={handleSubmit} 
              stage={stage} 
              jobState={jobState}
            />    </div>

                {/* Error state */}
                {error && (
                  <div
                    className="max-w-2xl mx-auto card p-4 flex items-start gap-3 animate-fade-in-up border-[#ef4444]/50 bg-[#ef4444]/10"
                  >
                    <AlertCircle size={20} className="shrink-0 mt-0.5 text-[#ef4444]" />
                    <div>
                      <p className="text-sm font-semibold text-[#ef4444]">
                        Something went wrong
                      </p>
                      <p className="text-sm mt-1 text-[#94a3b8]">
                        {error}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setError(null);
                        setStage('IDLE');
                      }}
                      className="text-xs px-4 py-2 rounded-lg ml-auto shrink-0 transition-colors bg-white/5 hover:bg-white/10 text-[#94a3b8]"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Shortcut back */}
                {confirmedEvents.length > 0 && stage === 'IDLE' && (
                  <div className="max-w-2xl mx-auto">
                    <button
                      onClick={() => {
                        setView('planner');
                        setStage('IDLE');
                      }}
                      className="w-full py-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border border-white/10 text-[#94a3b8] hover:bg-white/5 transition-all backdrop-blur-md bg-black/20"
                    >
                      <ArrowRight size={16} />
                      Back to Planner ({confirmedEvents.length} events)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Review view */}
            {view === 'review' && (
              <ReviewEvent events={extractedEvents} onConfirm={handleConfirmEvents} />
            )}

            {/* Success view (Intermediate) */}
            {view === 'success' && (
              <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
                <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                  <CheckCircle2 size={32} className="text-green-500" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-8">{lastConfirmed.length} events found</h2>
                
                <div className="flex flex-col gap-4 text-center">
                  {lastConfirmed.filter(e => e.strictDeadline).length > 0 && (
                    <div className="text-[#94a3b8] flex items-center gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div>
                      {lastConfirmed.filter(e => e.strictDeadline).length} strict deadline{lastConfirmed.filter(e => e.strictDeadline).length > 1 ? 's' : ''}
                    </div>
                  )}
                  {lastConfirmed.filter(e => e.deadlineChange).length > 0 && (
                    <div className="text-[#94a3b8] flex items-center gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#f59e0b]"></div>
                      {lastConfirmed.filter(e => e.deadlineChange).length} deadline change{lastConfirmed.filter(e => e.deadlineChange).length > 1 ? 's' : ''}
                    </div>
                  )}
                  {lastConfirmed.filter(e => e.additionalInformationPending).length > 0 && (
                    <div className="text-[#94a3b8] flex items-center gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                      {lastConfirmed.filter(e => e.additionalInformationPending).length} information item{lastConfirmed.filter(e => e.additionalInformationPending).length > 1 ? 's' : ''} pending
                    </div>
                  )}
                  {lastConfirmed.filter(e => !e.strictDeadline && !e.deadlineChange && !e.additionalInformationPending).length > 0 && (
                    <div className="text-[#94a3b8] flex items-center gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#4f7df5]"></div>
                      {lastConfirmed.filter(e => !e.strictDeadline && !e.deadlineChange && !e.additionalInformationPending).length} standard event{lastConfirmed.filter(e => !e.strictDeadline && !e.deadlineChange && !e.additionalInformationPending).length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Planner view */}
            {view === 'planner' && (
              <Planner events={confirmedEvents} onAddMore={handleAddMore} />
            )}
          </div>
        </main>

        {/* Footer */}
        <footer
          className="mt-auto border-t px-4 sm:px-6 py-6 text-center text-xs border-white/5 text-[#64748b] bg-black/20 backdrop-blur-md"
        >
          NoticeSync — AI extracts. You decide. Built for Hack Fiesta Miami 2026.
        </footer>
      </div>
    </>
  );
}
