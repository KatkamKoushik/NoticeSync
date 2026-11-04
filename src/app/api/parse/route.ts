import { NextRequest, NextResponse } from 'next/server';
import {
  extractEventsWithSchemaRetry,
  MalformedModelOutputError,
} from '@/lib/ai';
import { RawExtractedEvent } from '@/lib/validation/schemas';
import { validateEvents } from '@/lib/validation';
import {
  extractPdfWithProvenance,
  extractImageText,
  normalizeText,
  CorruptFileError,
  ExtractionTimeoutError,
  PageProvenance,
} from '@/lib/ingestion/extractors';
import {
  validateAndReadStream,
  validateExtractedTextBounds,
  PayloadTooLargeError,
  MimeSpoofingError,
  EncryptedFileError,
  DecompressionBombError,
} from '@/lib/ingestion/streamValidation';
import { chunkText } from '@/lib/ingestion/chunking';
import { storeChunk } from '@/lib/rag/storage';
import { augmentEventWithMemory } from '@/lib/ai/reasoning';
import { logError, traceAiCall } from '@/lib/observability';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { isValidUuid, sanitizeFileName, safeErrorResponse } from '@/lib/validation/security';
import { computeContentHash, computeEventDedupHash } from '@/lib/ingestion/hash';
import {
  evaluateJobCompletion,
  updateJobState,
  PipelineCompletionMetrics,
} from '@/lib/jobs/stateMachine';
import { createConcurrencyLimiter } from '@/lib/resilience/retry';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_LENGTH = 10000;

export async function POST(req: NextRequest) {
  let activeJobId: string | null = null;
  let verifiedUserId: string | null = null;
  let userScopedDb: SupabaseClient | null = null;

  try {
    // 1. Authenticate user from server session (enforces CSRF for cookie auth)
    const session = await getAuthenticatedUser(req);
    verifiedUserId = session.user.id;
    userScopedDb = session.userClient;
    const db = userScopedDb;

    // 2. Enforce Rate Limit (10 parses per minute per user)
    const rateLimitResponse = enforceRateLimit(`parse:${verifiedUserId}`, 10);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Parse and validate FormData
    const formData = await req.formData();
    const jobIdParam = formData.get('jobId');
    if (typeof jobIdParam === 'string' && isValidUuid(jobIdParam)) {
      activeJobId = jobIdParam;

      // Verify that this job actually belongs to the authenticated user
      const { data: job, error: jobError } = await db
        .from('processing_jobs')
        .select('id, user_id, status')
        .eq('id', activeJobId)
        .eq('user_id', verifiedUserId)
        .single();

      if (jobError || !job) {
        return NextResponse.json({ error: 'Job not found or access denied.' }, { status: 403 });
      }
    }

    const pdfFile = formData.get('pdf') as File | null;
    const imageFile = formData.get('image') as File | null;
    const textInput = formData.get('text') as string | null;

    let extractedText = '';
    let sourceType: 'pdf' | 'image' | 'text' = 'text';
    let title = 'Pasted Text';
    let pageProvenance: PageProvenance[] = [];

    if (activeJobId) {
      await updateJobState({
        jobId: activeJobId,
        userId: verifiedUserId,
        step: 'Extracting text...',
        progress: 10,
        status: 'processing',
        client: db,
      });
    }

    // --- PDF ---
    if (pdfFile && pdfFile instanceof File) {
      sourceType = 'pdf';
      title = sanitizeFileName(pdfFile.name, 'Uploaded Syllabus.pdf');
      
      // Enforce streaming byte limits, extension verification, MIME cross-check, encrypted PDF detection
      const buffer = await validateAndReadStream(pdfFile, 'pdf', MAX_PDF_SIZE);
      const pdfResult = await extractPdfWithProvenance(buffer);
      extractedText = pdfResult.text;
      pageProvenance = pdfResult.pages;
      validateExtractedTextBounds(extractedText, buffer.length);
    }
    // --- Image ---
    else if (imageFile && imageFile instanceof File) {
      sourceType = 'image';
      title = sanitizeFileName(imageFile.name, 'Notice Screenshot.png');
      
      // Enforce streaming byte limits, extension verification, MIME cross-check
      const buffer = await validateAndReadStream(imageFile, 'image', MAX_IMAGE_SIZE);
      extractedText = await extractImageText(buffer);
      validateExtractedTextBounds(extractedText, buffer.length);
    }
    // --- Text ---
    else if (textInput && textInput.trim().length > 0) {
      sourceType = 'text';
      extractedText = normalizeText(textInput.trim().substring(0, MAX_TEXT_LENGTH));
    } else {
      return NextResponse.json(
        { error: 'Please provide a PDF, image, or text input.' },
        { status: 400 }
      );
    }

    if (extractedText.length < 10) {
      if (activeJobId) {
        await updateJobState({
          jobId: activeJobId,
          userId: verifiedUserId,
          step: 'Failed',
          progress: 0,
          status: 'failed',
          errorMessage: 'Not enough readable text was extracted from this document.',
          client: db,
        });
      }
      return NextResponse.json(
        { error: 'Not enough readable text was extracted from this document.' },
        { status: 400 }
      );
    }

    if (activeJobId) {
      await updateJobState({
        jobId: activeJobId,
        userId: verifiedUserId,
        step: 'Building academic memory...',
        progress: 30,
        status: 'processing',
        client: db,
      });
    }

    // 4. Store or Deduplicate Document under verified user_id
    const contentHash = computeContentHash(verifiedUserId, sourceType, extractedText);
    let docId: string;

    const { data: existingDoc } = await db
      .from('documents')
      .select('id, title')
      .eq('content_hash', contentHash)
      .eq('user_id', verifiedUserId)
      .single();

    if (existingDoc) {
      docId = existingDoc.id;
    } else {
      const { data: newDoc, error: docError } = await db
        .from('documents')
        .insert({
          user_id: verifiedUserId,
          title,
          source_type: sourceType,
          original_text: extractedText,
          content_hash: contentHash,
        })
        .select('id')
        .single();

      if (docError || !newDoc) {
        logError(new Error(docError?.message || 'Failed to create document'), {
          userId: verifiedUserId,
        });
        throw new Error('Failed to record document.');
      }
      docId = newDoc.id;
    }

    // Link active job to document
    if (activeJobId) {
      await db
        .from('processing_jobs')
        .update({ document_id: docId })
        .eq('id', activeJobId)
        .eq('user_id', verifiedUserId);
    }

    // 5. Chunk & Embed with verified ownership & bounded concurrency
    const chunks = chunkText(extractedText);
    const chunkLimiter = createConcurrencyLimiter(3);
    let storedChunks = 0;
    let failedChunks = 0;

    await Promise.all(
      chunks.map((chunk, i) =>
        chunkLimiter(async () => {
          try {
            let chunkPageNumber: number | undefined;
            if (pageProvenance.length > 0) {
              const chunkSnippet = chunk.substring(0, 40);
              const foundPage = pageProvenance.find((p) => p.text.includes(chunkSnippet));
              if (foundPage) chunkPageNumber = foundPage.pageNumber;
            }

            await storeChunk({
              userId: verifiedUserId!,
              documentId: docId,
              content: chunk,
              chunkIndex: i,
              pageNumber: chunkPageNumber,
              metadata: { title, pageNumber: chunkPageNumber },
              client: db,
            });
            storedChunks++;
          } catch (e) {
            failedChunks++;
            logError(e, { step: 'storeChunk', chunkIndex: i, docId });
          }
        })
      )
    );

    if (activeJobId) {
      await updateJobState({
        jobId: activeJobId,
        userId: verifiedUserId,
        step: 'Gemma reasoning...',
        progress: 50,
        status: 'processing',
        client: db,
      });
    }

    // 6. Call AI Extraction with Strict Schema Validation and Multi-Section Partitioning
    const startTime = Date.now();
    let rawEvents: RawExtractedEvent[] = [];

    if (extractedText.length <= 12000) {
      const textForAi = extractedText;
      rawEvents = await extractEventsWithSchemaRetry(textForAi);
    } else {
      // Partition large documents into overlapping sections (10,000 chars with 1,000 char overlap)
      const SECTION_SIZE = 10000;
      const SECTION_OVERLAP = 1000;
      const MAX_SECTIONS = 5;
      const sections: string[] = [];

      for (
        let start = 0;
        start < extractedText.length && sections.length < MAX_SECTIONS;
        start += (SECTION_SIZE - SECTION_OVERLAP)
      ) {
        sections.push(extractedText.substring(start, start + SECTION_SIZE));
      }

      const extractionLimiter = createConcurrencyLimiter(2);
      const sectionResults = await Promise.all(
        sections.map((sectionText) =>
          extractionLimiter(() => extractEventsWithSchemaRetry(sectionText))
        )
      );

      // Deduplicate overlapping events across sections by computed event hash
      const seenEventHashes = new Set<string>();
      for (const sectionEvents of sectionResults) {
        for (const evt of sectionEvents) {
          const hash = computeEventDedupHash({
            title: evt.title,
            date: evt.date,
            type: evt.type,
            course: evt.course,
            sourceExcerpt: evt.sourceText,
            description: evt.description,
          });
          if (!seenEventHashes.has(hash)) {
            seenEventHashes.add(hash);
            rawEvents.push(evt);
          }
        }
      }
    }

    traceAiCall(
      'Event Extraction',
      { length: Math.min(extractedText.length, 50000) },
      { count: rawEvents.length },
      {
        latencyMs: Date.now() - startTime,
        sourceType,
      }
    );

    let events = validateEvents(rawEvents, sourceType, {
      documentId: docId,
      documentTitle: title,
    });

    // Cross-reference source excerpts to find matching chunk indices and page numbers
    for (const event of events) {
      if (event.sourceExcerpt && event.sourceExcerpt.length > 5) {
        const cleanSnippet = event.sourceExcerpt.replace(/[.,;:]+$/, '').substring(0, 30);
        const matchedIdx = chunks.findIndex((c) => c.includes(cleanSnippet));
        if (matchedIdx !== -1) {
          event.chunkIndex = matchedIdx;
        }
        if (pageProvenance.length > 0) {
          const foundPage = pageProvenance.find((p) => p.text.includes(cleanSnippet));
          if (foundPage) {
            event.pageNumber = foundPage.pageNumber;
          }
        }
      }
    }

    if (activeJobId) {
      await updateJobState({
        jobId: activeJobId,
        userId: verifiedUserId,
        step: 'Detecting changes and conflicts...',
        progress: 80,
        status: 'processing',
        client: db,
      });
    }

    // 7. Multi-document reasoning with bounded concurrency using userScopedDb
    const reasoningLimiter = createConcurrencyLimiter(2);
    const augmentedEvents = await Promise.all(
      events.map((event) =>
        reasoningLimiter(() => augmentEventWithMemory(event, verifiedUserId!, db))
      )
    );
    events = augmentedEvents;

    // 8. Save events strictly tied to verified user and document with idempotent dedup_hash
    let storedEvents = 0;
    let failedEvents = 0;

    for (const event of events) {
      const rawPriority = event.importance || 'Medium';
      const formattedPriority =
        String(rawPriority).charAt(0).toUpperCase() + String(rawPriority).slice(1).toLowerCase();
      const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
      const dbPriority = validPriorities.includes(formattedPriority)
        ? formattedPriority
        : 'Medium';

      const dedupHash = computeEventDedupHash(event);

      const isDeadlineChanged =
        event.deadlineChange !== 'none' && event.deadlineChange !== 'unchanged';

      const { data: savedEvent, error: eventError } = await db.from('academic_events').upsert(
        {
          id: event.id,
          user_id: verifiedUserId,
          document_id: docId,
          dedup_hash: dedupHash,
          title: event.title,
          date: event.date,
          type: event.type,
          description: event.description,
          confidence: event.confidence,
          priority: dbPriority,
          strict_deadline: event.strictDeadline,
          deadline_change: isDeadlineChanged,
          information_pending: event.additionalInformationPending,
          status: event.needsReview ? 'pending_review' : 'confirmed',
          source_excerpt: event.sourceExcerpt || event.sourceText,
          location: event.location || null,
          page_number: event.pageNumber ?? null,
          chunk_index: event.chunkIndex ?? null,
        },
        {
          onConflict: 'document_id,dedup_hash',
        }
      ).select('id').single();

      if (eventError) {
        failedEvents++;
        logError(new Error(eventError.message), { step: 'saveEvent', userId: verifiedUserId });
      } else {
        if (savedEvent && typeof (savedEvent as Record<string, unknown>).id === 'string') {
          event.id = (savedEvent as Record<string, unknown>).id as string;
        }
        storedEvents++;
      }
    }

    // 9. Evaluate Completion Criteria (Never silently swallow failures)
    const metrics: PipelineCompletionMetrics = {
      totalChunks: chunks.length,
      storedChunks,
      failedChunks,
      totalEvents: events.length,
      storedEvents,
      failedEvents,
    };
    const finalStatus = evaluateJobCompletion(metrics);

    if (activeJobId) {
      if (finalStatus === 'completed') {
        await updateJobState({
          jobId: activeJobId,
          userId: verifiedUserId,
          step: 'Academic plan ready',
          progress: 100,
          status: 'completed',
          client: db,
        });
      } else if (finalStatus === 'partial_success') {
        await updateJobState({
          jobId: activeJobId,
          userId: verifiedUserId,
          step: 'Completed with warnings',
          progress: 90,
          status: 'partial_success',
          errorMessage: `Processing finished with partial items: ${failedChunks} chunk(s) and ${failedEvents} event(s) could not be recorded.`,
          client: db,
        });
      } else {
        await updateJobState({
          jobId: activeJobId,
          userId: verifiedUserId,
          step: 'Failed',
          progress: 0,
          status: 'failed',
          errorMessage: 'Storage of document embeddings or academic events failed completely.',
          client: db,
        });
      }
    }

    return NextResponse.json({
      events,
      documentId: docId,
      jobStatus: finalStatus,
      metrics: {
        chunksStored: storedChunks,
        chunksTotal: chunks.length,
        eventsStored: storedEvents,
        eventsTotal: events.length,
      },
      message:
        events.length === 0
          ? 'Gemma could not extract any dated academic events.'
          : `Processed ${events.length} academic event(s) (${storedEvents} saved).`,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    // Safe error update strictly using user-scoped client if user was verified
    const safeJobUpdate = async (errorMsg: string) => {
      if (activeJobId && verifiedUserId && userScopedDb) {
        await updateJobState({
          jobId: activeJobId,
          userId: verifiedUserId,
          step: 'Failed',
          progress: 0,
          status: 'failed',
          errorMessage: errorMsg,
          client: userScopedDb,
        });
      }
    };

    if (err instanceof PayloadTooLargeError) {
      await safeJobUpdate(err.message);
      return NextResponse.json({ error: err.message }, { status: 413 });
    }

    if (err instanceof MimeSpoofingError || err instanceof EncryptedFileError) {
      await safeJobUpdate(err.message);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (err instanceof DecompressionBombError) {
      await safeJobUpdate(err.message);
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    if (err instanceof CorruptFileError) {
      await safeJobUpdate(err.message);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (err instanceof ExtractionTimeoutError) {
      await safeJobUpdate(err.message);
      return NextResponse.json({ error: err.message }, { status: 504 });
    }

    if (err instanceof MalformedModelOutputError) {
      await safeJobUpdate('AI model extraction output failed strict schema validation.');
      return NextResponse.json(
        { error: 'AI model produced malformed output: ' + err.message },
        { status: 422 }
      );
    }

    await safeJobUpdate('Processing encountered an unrecoverable error.');
    logError(err, { route: '/api/parse', activeJobId });
    return safeErrorResponse(err, 500, 'Failed to process document.');
  }
}
