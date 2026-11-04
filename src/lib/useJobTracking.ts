import { useEffect, useState } from 'react';
import { supabase, fetchWithAuth } from './supabase/client';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial_success';

export interface JobState {
  status: JobStatus;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
}

export function useJobTracking(jobId: string | null) {
  const [jobState, setJobState] = useState<JobState | null>(() => (
    jobId ? {
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      errorMessage: null,
    } : null
  ));

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let isSubscribed = true;

    // Realtime channel listener
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
          if (!isSubscribed) return;
          const newRecord = payload.new as Record<string, unknown>;
          const newStatus = newRecord.status as JobStatus;
          setJobState({
            status: newStatus,
            progress: typeof newRecord.progress === 'number' ? newRecord.progress : 0,
            currentStep: String(newRecord.current_step || ''),
            errorMessage: (newRecord.error_message as string) || null,
          });
          if (['completed', 'failed', 'partial_success'].includes(newStatus)) {
            clearInterval(pollInterval);
          }
        }
      )
      .subscribe();

    // Fallback polling every 2 seconds in case Realtime WebSockets are not configured
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/jobs?jobId=${jobId}`);
        if (res.ok && isSubscribed) {
          const data = await res.json();
          if (data.job) {
            setJobState({
              status: data.job.status,
              progress: data.job.progress,
              currentStep: data.job.currentStep,
              errorMessage: data.job.errorMessage,
            });
            if (['completed', 'failed', 'partial_success'].includes(data.job.status)) {
              clearInterval(pollInterval);
            }
          }
        }
      } catch {
        // Ignore polling error
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return jobId ? jobState : null;
}
