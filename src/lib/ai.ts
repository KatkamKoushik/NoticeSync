import { RawExtractionResponseSchema, RawExtractedEvent } from './validation/schemas';
import { getLLMProvider } from './providers';

export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export class MalformedModelOutputError extends Error {
  public readonly rawResponse?: string;
  constructor(message: string, rawResponse?: string) {
    super(message);
    this.name = 'MalformedModelOutputError';
    this.rawResponse = rawResponse;
  }
}

/**
 * Call configured LLM provider (Groq, Gemini, local Gemma/Ollama, or Mock) with untrusted document boundaries.
 * Pluggable and configurable via LLM_PROVIDER environment variable.
 */
export async function callGemma(extractedText: string, extraInstructions?: string): Promise<string> {
  const provider = getLLMProvider();
  return provider.extractEvents(extractedText, extraInstructions);
}

/**
 * Extracts JSON array substring from raw model output.
 */
export function extractJsonSubstring(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }

  if (cleaned.startsWith('json')) {
    cleaned = cleaned.substring(4);
  }
  cleaned = cleaned.trim();

  const bracketStart = cleaned.indexOf('[');
  const bracketEnd = cleaned.lastIndexOf(']');
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    return cleaned.substring(bracketStart, bracketEnd + 1);
  }

  return cleaned;
}

/**
 * Parses and strictly validates AI extraction response against Zod schema.
 * Throws MalformedModelOutputError on invalid JSON syntax or schema violations.
 */
export function parseAndValidateExtraction(raw: string): RawExtractedEvent[] {
  const jsonSubstring = extractJsonSubstring(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSubstring);
  } catch (err: unknown) {
    throw new MalformedModelOutputError(
      `Model output is not valid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
      raw
    );
  }

  if (!Array.isArray(parsed)) {
    throw new MalformedModelOutputError('Model output must be a top-level JSON array of events', raw);
  }

  const validationResult = RawExtractionResponseSchema.safeParse(parsed);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((issue) => `[${issue.path.join('.')}: ${issue.message}]`)
      .join(', ');
    throw new MalformedModelOutputError(
      `Model output violated schema: ${errorMessages}`,
      raw
    );
  }

  return validationResult.data;
}

/**
 * Backwards-compatible parser that does not throw.
 */
export function parseAiJson(raw: string): unknown[] {
  try {
    return parseAndValidateExtraction(raw);
  } catch {
    return [];
  }
}

/**
 * High-reliability event extraction pipeline with strict schema validation
 * and explicit bounded schema repair retry.
 */
export async function extractEventsWithSchemaRetry(
  extractedText: string
): Promise<RawExtractedEvent[]> {
  // Attempt 1: Standard extraction
  let rawText = await callGemma(extractedText);
  try {
    return parseAndValidateExtraction(rawText);
  } catch (err: unknown) {
    if (!(err instanceof MalformedModelOutputError)) throw err;

    console.warn(`Initial extraction failed schema validation: ${err.message}. Retrying with schema repair.`);

    // Attempt 2: Explicit repair retry with error feedback
    const repairInstruction = `CRITICAL: Your previous response was rejected due to schema error: ${err.message}.
Fix the output. Return ONLY a valid JSON array of objects with keys: title, date, type, description, confidence, importance, actionRequired, strictDeadline, deadlineChange, additionalInformationPending, sourceText, course.`;

    rawText = await callGemma(extractedText, repairInstruction);
    return parseAndValidateExtraction(rawText);
  }
}

/**
 * Call configured LLM provider to generate a brief summary from a list of confirmed events.
 */
export async function generateAcademicBrief(eventsJson: string): Promise<string> {
  const provider = getLLMProvider();
  return provider.generateBrief(eventsJson);
}
