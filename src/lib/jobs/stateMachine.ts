import { JobStatus } from '../types';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../supabase/server';
import { logError } from '../observability';

/**
 * Valid transitions between NoticeSync job statuses.
 */
export const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: ['processing', 'failed'],
  processing: ['completed', 'partial_success', 'failed'],
  completed: ['processing'], // Allowed only if re-running
  partial_success: ['processing'], // Allowed on retry
  failed: ['pending', 'processing'], // Allowed on retry
};

export class JobStateTransitionError extends Error {
  public readonly fromStatus: JobStatus;
  public readonly toStatus: JobStatus;

  constructor(fromStatus: JobStatus, toStatus: JobStatus) {
    super(`Invalid job status transition from '${fromStatus}' to '${toStatus}'.`);
    this.name = 'JobStateTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

/**
 * Checks whether a transition between two job statuses is valid.
 */
export function isValidJobTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true; // Idempotent same-state update
  const allowed = VALID_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export interface PipelineCompletionMetrics {
  totalChunks: number;
  storedChunks: number;
  failedChunks: number;
  totalEvents: number;
  storedEvents: number;
  failedEvents: number;
}

/**
 * Evaluates completion criteria for an ingestion pipeline run.
 * 
 * - 'completed': All chunks stored successfully AND all extracted events stored successfully.
 * - 'partial_success': Some chunks or events succeeded, but one or more non-fatal items failed.
 * - 'failed': Total failure (e.g. 0 chunks stored, or critical extraction failure).
 */
export function evaluateJobCompletion(metrics: PipelineCompletionMetrics): JobStatus {
  // If no chunks were stored and there were chunks to store -> failed
  if (metrics.totalChunks > 0 && metrics.storedChunks === 0) {
    return 'failed';
  }

  // If there were any failures, mark as partial_success
  if (metrics.failedChunks > 0 || metrics.failedEvents > 0) {
    return 'partial_success';
  }

  return 'completed';
}

export interface UpdateJobOptions {
  jobId: string;
  userId: string;
  step: string;
  progress: number;
  status: JobStatus;
  errorMessage?: string | null;
  client?: SupabaseClient;
}

/**
 * Updates a job with state transition enforcement.
 */
export async function updateJobState(options: UpdateJobOptions): Promise<boolean> {
  const { jobId, userId, step, progress, status, errorMessage, client } = options;
  const db = client || supabaseServer;

  try {
    // 1. Fetch current status to enforce valid state transitions
    const { data: currentJob, error: fetchErr } = await db
      .from('processing_jobs')
      .select('status, progress')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentJob) {
      logError(new Error(fetchErr?.message || 'Job not found'), { jobId, userId, step: 'updateJobState.fetch' });
      return false;
    }

    const currentStatus = (currentJob.status as JobStatus) || 'pending';

    if (!isValidJobTransition(currentStatus, status)) {
      throw new JobStateTransitionError(currentStatus, status);
    }

    // 2. Perform atomic update
    const { error: updateErr } = await db
      .from('processing_jobs')
      .update({
        status,
        current_step: step,
        progress: Math.max(0, Math.min(100, progress)),
        error_message: errorMessage ? errorMessage.substring(0, 500) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('user_id', userId);

    if (updateErr) {
      logError(new Error(updateErr.message), { jobId, userId, step: 'updateJobState.update' });
      return false;
    }

    return true;
  } catch (err: unknown) {
    logError(err, { jobId, userId, step: 'updateJobState' });
    return false;
  }
}
