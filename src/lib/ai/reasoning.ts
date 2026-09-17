import { callGemma, parseAiJson } from '../ai';
import { retrieveRelevantChunks } from '../rag/storage';
import { AcademicEvent } from '../types';

/**
 * Cross-references a newly extracted event against the user's RAG memory
 * to detect conflicts, deadline changes, and assess priority.
 */
export async function augmentEventWithMemory(
  newEvent: AcademicEvent,
  userId: string
): Promise<AcademicEvent> {
  // 1. Retrieve related memory
  const query = `${newEvent.title} ${newEvent.type} ${newEvent.course || ''}`;
  const relevantChunks = await retrieveRelevantChunks({
    query,
    userId,
    matchCount: 3,
  });

  if (!relevantChunks || relevantChunks.length === 0) {
    // No memory to compare against, use basic deterministic priority
    return assignDeterministicPriority(newEvent);
  }

  // 2. Prepare memory context for Gemma
  const memoryContext = relevantChunks
    .map((chunk) => `[Source: ${chunk.metadata?.title || 'Unknown'}] ${chunk.content}`)
    .join('\n\n');

  const reasoningPrompt = `
You are an academic logic engine.
A new academic event was extracted:
${JSON.stringify(newEvent, null, 2)}

Here is the historical academic memory retrieved from the student's past documents:
${memoryContext}

Task:
Compare the new event against the memory.
1. Is there a conflict? (e.g., different dates for the exact same assignment)
2. Has the deadline changed? (e.g., extended, moved_earlier, cancelled)
3. What is the priority? (Critical, High, Medium, Low)

Respond ONLY with a JSON object containing:
{
  "conflictDetected": boolean,
  "conflictReason": "string describing conflict or null",
  "deadlineChange": "none | extended | postponed | rescheduled | moved_earlier | cancelled | unknown",
  "priority": "low | medium | high | critical",
  "reasoning": "Brief explanation of priority and conflicts"
}
`;

  // 3. Call Gemma for reasoning
  try {
    const rawAiResponse = await callGemma(reasoningPrompt);
    const parsed = parseAiJson(rawAiResponse) as any;
    
    // Some basic defense if Gemma returned an array
    const reasoningData = Array.isArray(parsed) ? parsed[0] : parsed;
    
    if (reasoningData) {
      newEvent.deadlineChange = reasoningData.deadlineChange || 'none';
      
      // Update importance/priority
      if (reasoningData.priority === 'critical') {
        newEvent.importance = 'high'; // map back to existing type for now or update type
      } else {
        newEvent.importance = reasoningData.priority || newEvent.importance;
      }
      
      if (reasoningData.conflictDetected) {
        newEvent.needsReview = true;
        newEvent.description = `[CONFLICT DETECTED] ${reasoningData.conflictReason}\n\n${newEvent.description}`;
      }
    }
  } catch (err) {
    console.error('Failed reasoning step, falling back to deterministic:', err);
  }

  return assignDeterministicPriority(newEvent);
}

function assignDeterministicPriority(event: AcademicEvent): AcademicEvent {
  // If it's strict, bump importance
  if (event.strictDeadline) {
    event.importance = 'high';
  }
  
  // If missing information or conflict, require review
  if (event.additionalInformationPending) {
    event.needsReview = true;
  }
  
  return event;
}
