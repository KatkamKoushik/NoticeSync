import { NextRequest, NextResponse } from 'next/server';
import { callGemma, parseAiJson } from '@/lib/ai';
import { validateEvents } from '@/lib/validation';
import type { AcademicEvent } from '@/lib/types';
import { extractPdfText, extractImageText, normalizeText } from '@/lib/ingestion/extractors';
import { chunkText } from '@/lib/ingestion/chunking';
import { storeChunk } from '@/lib/rag/storage';
import { augmentEventWithMemory } from '@/lib/ai/reasoning';
import { supabaseServer } from '@/lib/supabase/server';
import { logError, traceAiCall } from '@/lib/observability';

export const runtime = 'nodejs';

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_TEXT_LENGTH = 10000;
const PDF_TYPES = ['application/pdf'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

async function updateJob(jobId: string, step: string, progress: number, status: 'processing' | 'completed' | 'failed' = 'processing', errorMsg?: string) {
  if (!jobId) return;
  await supabaseServer.from('processing_jobs').update({
    current_step: step,
    progress,
    status,
    error_message: errorMsg || null,
    updated_at: new Date().toISOString()
  }).eq('id', jobId);
}

export async function POST(req: NextRequest) {
  let jobId = '';
  // Hardcoded for demo; in production use Auth
  const userId = '00000000-0000-0000-0000-000000000000'; 

  try {
    const formData = await req.formData();
    jobId = formData.get('jobId') as string;
    
    const pdfFile = formData.get('pdf') as File | null;
    const imageFile = formData.get('image') as File | null;
    const textInput = formData.get('text') as string | null;

    let extractedText = '';
    let sourceType: 'pdf' | 'image' | 'text' = 'text';
    let title = 'Pasted Text';

    await updateJob(jobId, 'Extracting text...', 10);

    // --- PDF ---
    if (pdfFile) {
      sourceType = 'pdf';
      title = pdfFile.name;
      if (!PDF_TYPES.includes(pdfFile.type)) throw new Error('Please upload a valid PDF file.');
      if (pdfFile.size > MAX_PDF_SIZE) throw new Error('PDF file is too large. Maximum size is 10MB.');
      const buffer = Buffer.from(await pdfFile.arrayBuffer());
      extractedText = await extractPdfText(buffer);
    }
    // --- Image ---
    else if (imageFile) {
      sourceType = 'image';
      title = imageFile.name;
      if (!IMAGE_TYPES.includes(imageFile.type)) throw new Error('Please upload a valid image.');
      if (imageFile.size > MAX_IMAGE_SIZE) throw new Error('Image file is too large. Maximum size is 5MB.');
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      extractedText = await extractImageText(buffer);
    }
    // --- Text ---
    else if (textInput && textInput.trim().length > 0) {
      sourceType = 'text';
      extractedText = normalizeText(textInput.trim().substring(0, MAX_TEXT_LENGTH));
    } else {
      throw new Error('Please provide a PDF, image, or text input.');
    }

    if (extractedText.length < 10) {
      throw new Error('Not enough readable text was extracted.');
    }

    await updateJob(jobId, 'Building academic memory...', 30);
    
    // Store Document
    const { data: doc, error: docError } = await supabaseServer.from('documents').insert({
      user_id: userId,
      title,
      source_type: sourceType,
      original_text: extractedText
    }).select('id').single();

    if (docError) throw docError;

    // Chunk & Embed
    const chunks = chunkText(extractedText);
    for (let i = 0; i < chunks.length; i++) {
      try {
        await storeChunk({
          userId,
          documentId: doc.id,
          content: chunks[i],
          chunkIndex: i,
          metadata: { title }
        });
      } catch (e) {
        logError(e, { step: 'storeChunk' });
        // continue even if one chunk fails
      }
    }

    await updateJob(jobId, 'Gemma reasoning...', 50);

    // Call Gemma
    const textForAi = extractedText.substring(0, 15000);
    const startTime = Date.now();
    const rawAiResponse = await callGemma(textForAi);
    
    traceAiCall('Event Extraction', textForAi, rawAiResponse, { latencyMs: Date.now() - startTime });
    
    const rawEvents = parseAiJson(rawAiResponse);
    let events = validateEvents(rawEvents, sourceType);

    await updateJob(jobId, 'Detecting changes and conflicts...', 80);

    // Multi-document reasoning
    const augmentedEvents = [];
    for (const event of events) {
      const augmented = await augmentEventWithMemory(event, userId);
      augmentedEvents.push(augmented);
    }
    events = augmentedEvents;

    // Save events to Supabase
    for (const event of events) {
      const rawPriority = event.importance || event.priority || 'Medium';
      const formattedPriority = String(rawPriority).charAt(0).toUpperCase() + String(rawPriority).slice(1).toLowerCase();
      const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
      const dbPriority = validPriorities.includes(formattedPriority) ? formattedPriority : 'Medium';

      const { error } = await supabaseServer.from('academic_events').insert({
        user_id: userId,
        document_id: doc.id,
        title: event.title,
        date: event.date,
        type: event.type,
        description: event.description,
        confidence: event.confidence,
        priority: dbPriority,
        strict_deadline: event.strictDeadline,
        deadline_change: event.deadlineChange !== 'none',
        information_pending: event.additionalInformationPending,
        status: event.needsReview ? 'pending_review' : 'confirmed'
      });
      if (error) {
        logError(new Error(error.message));
      }
    }

    await updateJob(jobId, 'Academic plan ready', 100, 'completed');

    return NextResponse.json({
      events,
      message: events.length === 0 ? 'Gemma could not extract any dated academic events.' : `Found ${events.length} academic event(s).`,
    });

  } catch (err: any) {
    logError(err, { jobId });
    await updateJob(jobId, 'Failed', 0, 'failed', err.message);
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred.' },
      { status: err.status || 500 }
    );
  }
}
