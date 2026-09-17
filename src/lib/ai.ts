const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are an academic information extraction and planning assistant.

Analyze the supplied college syllabus, circular, announcement, notice, screenshot text, or student task.

Extract every actionable academic event and every important academic constraint or change.

Return ONLY a valid JSON array.

Each event must have exactly these fields:

{
  "title": "string",
  "date": "YYYY-MM-DD or null",
  "type": "Exam | Assignment | Notice",
  "description": "string",
  "confidence": 1-100,
  "importance": "low | medium | high",
  "actionRequired": true | false,
  "strictDeadline": true | false,
  "deadlineChange": "none | extended | postponed | rescheduled | moved_earlier | cancelled | unknown",
  "additionalInformationPending": true | false,
  "sourceText": "supporting source phrase",
  "course": "string or null"
}

Rules:

1. Never invent a date.
2. Only use an exact date when the source provides enough information.
3. If the exact date cannot be determined, use null.
4. Detect exams, assignments, projects, submissions, quizzes, presentations, registration deadlines, and important academic notices.
5. Detect strict rules such as "no late submissions".
6. Detect deadline changes such as extended, postponed, rescheduled, revised, moved, or cancelled.
7. Detect information that is still pending.
8. Preserve important constraints in the description.
9. Preserve supporting evidence in sourceText.
10. Do not create duplicate events.
11. Mark deadlines with consequences or strict rules as high importance.
12. Set actionRequired=true when the student needs to do something.
13. Set actionRequired=false for purely informational notices.
14. Return [] when no valid academic event or actionable information exists.
15. Do not infer information that is not supported by the source.
16. Return ONLY JSON.
17. Do not return markdown.
18. Do not return explanations outside the JSON array.`;

/**
 * Helper to make a request to the Groq API using multiple fallback keys.
 */
async function fetchWithFallback(payload: Record<string, unknown>): Promise<any> {
  const keys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    process.env.GROQ_API_KEY_6,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    throw new Error('No GROQ_API_KEY configured in .env.local');
  }

  let lastError: Error | null = null;
  let lastStatus = 0;

  for (const key of keys) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return await response.json();
      }

      // If we hit a 429 Too Many Requests or 5xx server error, we should try the next key
      if (response.status === 429 || response.status >= 500) {
        lastStatus = response.status;
        const errorBody = await response.text();
        console.warn(`Groq API returned ${response.status} with key ${key.substring(0, 8)}... Trying next key if available. Body: ${errorBody}`);
        continue;
      }
      
      // For client errors (400, 401, etc.), throw immediately
      const errorBody = await response.text();
      console.error('Groq API error:', response.status, errorBody);
      throw new Error(`Groq API returned ${response.status}`);
      
    } catch (err: any) {
      lastError = err;
      console.warn(`Fetch error with key ${key.substring(0, 8)}... Trying next.`, err.message);
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`All Groq API keys exhausted. Last status: ${lastStatus}`);
}

/**
 * Call Groq (Gemma) to extract events from academic text.
 * Returns the raw text response from the model.
 */
export async function callGemma(extractedText: string): Promise<string> {
  const data = await fetchWithFallback({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Academic source:\n${extractedText}` }
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error('Groq returned an unexpected response structure');
  }

  return text;
}

/**
 * Robustly parse the raw AI text response into JSON.
 * Handles: plain JSON, markdown-fenced JSON, extra whitespace.
 */
export function parseAiJson(raw: string): unknown[] {
  let cleaned = raw.trim();

  // Remove markdown fences
  if (cleaned.startsWith('\`\`\`')) {
    const firstNewline = cleaned.indexOf('\\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }
  if (cleaned.endsWith('\`\`\`')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  
  if (cleaned.startsWith('json')) {
      cleaned = cleaned.substring(4);
  }
  cleaned = cleaned.trim();

  // Try to find a JSON array within the text
  const bracketStart = cleaned.indexOf('[');
  const bracketEnd = cleaned.lastIndexOf(']');
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    cleaned = cleaned.substring(bracketStart, bracketEnd + 1);
  }

  if (!cleaned) return [];

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    console.error('Failed to parse AI JSON response:', raw.substring(0, 500));
    return [];
  }
}

const BRIEF_SYSTEM_PROMPT = `You are an academic advisor. Write a concise academic brief summarizing the provided events.

Rules:
1. Summarize the user's workload briefly (e.g. "3 important academic events found.").
2. Highlight pending information (e.g. "timetable is still pending").
3. Highlight strict deadlines (e.g. "strict September 2 deadline with no late submissions").
4. Highlight deadline changes (e.g. "extended to September 10").
5. Only use validated event information.
6. Never invent details.
7. Keep it concise.
8. Return plain text (a few short sentences or bullet points), not JSON.`;

/**
 * Call Groq to generate a brief summary from a list of confirmed events.
 */
export async function generateAcademicBrief(eventsJson: string): Promise<string> {
  const data = await fetchWithFallback({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: BRIEF_SYSTEM_PROMPT },
      { role: "user", content: `Events:\n${eventsJson}` }
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error('Groq returned an unexpected response structure');
  }

  return text.trim();
}
