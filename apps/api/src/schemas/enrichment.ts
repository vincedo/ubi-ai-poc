import { z } from 'zod';

export const mcqSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export const enrichmentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(3).max(10),
  mcqs: z.array(mcqSchema).min(1).max(5),
});

export const fieldSchemas = {
  title: z.object({ title: z.string() }),
  summary: z.object({ summary: z.string() }),
  keywords: z.object({ keywords: z.array(z.string()).min(3).max(10) }),
  mcqs: z.object({ mcqs: z.array(mcqSchema).min(1).max(5) }),
} as const;

export type EnrichmentField = keyof typeof fieldSchemas;
export const VALID_FIELDS = Object.keys(fieldSchemas) as EnrichmentField[];
