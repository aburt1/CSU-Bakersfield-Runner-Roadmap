import { z } from 'zod';

export const completionItemSchema = z.object({
  student_id_number: z.string().min(1, 'student_id_number is required'),
  step_key: z.string().min(1, 'step_key is required'),
  status: z.enum(['completed', 'waived', 'not_completed'], {
    error: 'status must be completed, waived, or not_completed',
  }),
  note: z.string().optional(),
  completed_at: z.string().optional(),
  source_event_id: z.string().min(1, 'source_event_id is required'),
});

export type CompletionItem = z.infer<typeof completionItemSchema>;

export const completionBatchSchema = z.object({
  items: z.array(z.unknown()).min(1, 'items must be a non-empty array'),
});
