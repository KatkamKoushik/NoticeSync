import { z } from 'zod';

export const RawExtractedEventSchema = z.object({
  title: z
    .string()
    .min(1, 'Event title cannot be empty')
    .max(300, 'Event title too long'),
  date: z.string().nullable().optional(),
  type: z
    .enum(['Exam', 'Assignment', 'Notice', 'Task'])
    .catch('Notice'),
  description: z.string().default(''),
  confidence: z
    .number()
    .min(1)
    .max(100)
    .catch(50),
  importance: z
    .enum(['low', 'medium', 'high'])
    .catch('medium'),
  actionRequired: z.boolean().catch(false),
  strictDeadline: z.boolean().catch(false),
  deadlineChange: z
    .enum([
      'none',
      'unchanged',
      'extended',
      'postponed',
      'rescheduled',
      'moved_earlier',
      'cancelled',
      'unknown',
    ])
    .catch('none'),
  deadlineChangeEvidence: z.string().nullable().optional(),
  additionalInformationPending: z.boolean().catch(false),
  sourceText: z.string().default(''),
  course: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

export const RawExtractionResponseSchema = z.array(RawExtractedEventSchema);

export const ReasoningOutputSchema = z.object({
  conflictDetected: z.boolean().default(false),
  conflictReason: z.string().nullable().optional(),
  deadlineChange: z
    .enum([
      'none',
      'unchanged',
      'extended',
      'postponed',
      'rescheduled',
      'moved_earlier',
      'cancelled',
      'unknown',
    ])
    .default('none'),
  deadlineEvidence: z.string().nullable().optional(),
  priorDate: z.string().nullable().optional(),
  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .default('medium'),
  reasoning: z.string().default(''),
});

export type RawExtractedEvent = z.infer<typeof RawExtractedEventSchema>;
export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
