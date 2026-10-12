import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidJobTransition,
  evaluateJobCompletion,
  updateJobState,
  JobStateTransitionError,
  PipelineCompletionMetrics,
} from '../../src/lib/jobs/stateMachine';
import { USER_A_ID } from '../helpers/testUtils';
import { createMockTestClient, resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('Ingestion Reliability: State Machine & Valid Transitions', () => {
  test('isValidJobTransition permits valid lifecycle transitions', () => {
    // Normal forward progression
    assert.equal(isValidJobTransition('pending', 'processing'), true);
    assert.equal(isValidJobTransition('processing', 'completed'), true);
    assert.equal(isValidJobTransition('processing', 'partial_success'), true);
    assert.equal(isValidJobTransition('processing', 'failed'), true);

    // Same-state updates (idempotent progress updates)
    assert.equal(isValidJobTransition('processing', 'processing'), true);
    assert.equal(isValidJobTransition('pending', 'pending'), true);

    // Retries from failed or partial_success
    assert.equal(isValidJobTransition('failed', 'processing'), true);
    assert.equal(isValidJobTransition('failed', 'pending'), true);
    assert.equal(isValidJobTransition('partial_success', 'processing'), true);
  });

  test('isValidJobTransition strictly forbids illegal state jumps', () => {
    // Cannot jump straight from pending to completed (skipping processing)
    assert.equal(isValidJobTransition('pending', 'completed'), false);
    // Cannot jump straight from pending to partial_success
    assert.equal(isValidJobTransition('pending', 'partial_success'), false);
    // Cannot reset completed job back to pending
    assert.equal(isValidJobTransition('completed', 'pending'), false);
    // Cannot jump from completed to partial_success
    assert.equal(isValidJobTransition('completed', 'partial_success'), false);
  });

  test('evaluateJobCompletion enforces strict completion criteria', () => {
    // 1. Total success: 10/10 chunks stored, 3/3 events stored
    const perfectMetrics: PipelineCompletionMetrics = {
      totalChunks: 10,
      storedChunks: 10,
      failedChunks: 0,
      totalEvents: 3,
      storedEvents: 3,
      failedEvents: 0,
    };
    assert.equal(evaluateJobCompletion(perfectMetrics), 'completed');

    // 2. Partial success: 1 chunk failed
    const partialChunkFailure: PipelineCompletionMetrics = {
      totalChunks: 10,
      storedChunks: 9,
      failedChunks: 1,
      totalEvents: 3,
      storedEvents: 3,
      failedEvents: 0,
    };
    assert.equal(
      evaluateJobCompletion(partialChunkFailure),
      'partial_success',
      'Must never report completed if any chunk failed'
    );

    // 3. Partial success: 1 event failed
    const partialEventFailure: PipelineCompletionMetrics = {
      totalChunks: 5,
      storedChunks: 5,
      failedChunks: 0,
      totalEvents: 4,
      storedEvents: 3,
      failedEvents: 1,
    };
    assert.equal(
      evaluateJobCompletion(partialEventFailure),
      'partial_success',
      'Must never report completed if any event failed to save'
    );

    // 4. Critical failure: All chunks failed to store
    const totalChunkFailure: PipelineCompletionMetrics = {
      totalChunks: 5,
      storedChunks: 0,
      failedChunks: 5,
      totalEvents: 2,
      storedEvents: 0,
      failedEvents: 2,
    };
    assert.equal(evaluateJobCompletion(totalChunkFailure), 'failed');
  });

  test('updateJobState executes valid transitions and updates progress in DB', async () => {
    resetTestDbStore();
    const mockClient = createMockTestClient(USER_A_ID);
    const jobId = '11111111-2222-3333-4444-555555555555';

    // Seed initial pending job
    testDbStore.processing_jobs.push({
      id: jobId,
      user_id: USER_A_ID,
      status: 'pending',
      progress: 0,
      current_step: 'Initializing...',
    });

    // 1. Transition pending -> processing
    const step1Ok = await updateJobState({
      jobId,
      userId: USER_A_ID,
      step: 'Extracting text...',
      progress: 25,
      status: 'processing',
      client: mockClient,
    });
    assert.equal(step1Ok, true);

    const jobInDb = testDbStore.processing_jobs.find((j) => j.id === jobId);
    assert.equal(jobInDb?.status, 'processing');
    assert.equal(jobInDb?.progress, 25);
    assert.equal(jobInDb?.current_step, 'Extracting text...');

    // 2. Transition processing -> completed
    const step2Ok = await updateJobState({
      jobId,
      userId: USER_A_ID,
      step: 'Academic plan ready',
      progress: 100,
      status: 'completed',
      client: mockClient,
    });
    assert.equal(step2Ok, true);
    assert.equal(jobInDb?.status, 'completed');
    assert.equal(jobInDb?.progress, 100);

    // 3. Attempt illegal transition: completed -> pending (must fail)
    const illegalStep = await updateJobState({
      jobId,
      userId: USER_A_ID,
      step: 'Resetting',
      progress: 0,
      status: 'pending',
      client: mockClient,
    });
    assert.equal(illegalStep, false, 'Illegal transition must be rejected');
    // Status in DB remains completed
    assert.equal(jobInDb?.status, 'completed');
  });
});
