import { useEffect, useState } from 'react';
import { supabase } from './supabase/client';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobState {
  status: JobStatus;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
}

export function useJobTracking(jobId: string | null) {
  const [jobState, setJobState] = useState<JobState | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJobState(null);
      return;
    }

    // Set initial state
    setJobState({
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      errorMessage: null,
    });

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const newRecord = payload.new;
          setJobState({
            status: newRecord.status as JobStatus,
            progress: newRecord.progress,
            currentStep: newRecord.current_step,
            errorMessage: newRecord.error_message,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return jobState;
}
