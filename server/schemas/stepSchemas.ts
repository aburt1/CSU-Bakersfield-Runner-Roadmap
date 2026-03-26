import { z } from 'zod';

export const stepCreateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  term_id: z.union([z.number(), z.string().transform(Number)]).pipe(z.number({ error: 'term_id must be a number' })),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sort_order: z.number().optional(),
  deadline: z.string().nullable().optional(),
  deadline_date: z.string().nullable().optional(),
  guide_content: z.string().nullable().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).nullable().optional(),
  required_tags: z.array(z.string()).nullable().optional(),
  excluded_tags: z.array(z.string()).nullable().optional(),
  required_tag_mode: z.enum(['any', 'all']).optional(),
  contact_info: z.unknown().nullable().optional(),
  is_public: z.union([z.boolean(), z.number()]).optional(),
  is_optional: z.union([z.boolean(), z.number()]).optional(),
  step_key: z.string().optional(),
});

export type StepCreateInput = z.infer<typeof stepCreateSchema>;

export const stepReorderSchema = z.object({
  order: z.array(z.object({
    id: z.number(),
    sort_order: z.number(),
  })),
});

export const stepBulkStatusSchema = z.object({
  stepIds: z.array(z.number()),
  is_active: z.union([z.literal(0), z.literal(1)]),
});
