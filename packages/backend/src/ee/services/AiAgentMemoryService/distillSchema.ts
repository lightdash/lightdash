import { aiProjectContextTypedObjectRefSchema } from '@lightdash/common';
import { z } from 'zod';

export const distillMemoryScopes = ['user', 'project'] as const;

export const distillNoOpReasons = [
    'insufficient_signal',
    'authoritative_source_duplicate',
    'no_positive_evidence',
    'failed_quality_rubric',
] as const;

const noOpSchema = z
    .object({
        type: z.literal('no_op'),
        reason: z.enum(distillNoOpReasons),
    })
    .strict();

const memorySchema = z
    .object({
        type: z.literal('memory'),
        thread_summary: z
            .string()
            .min(1)
            .max(12_000)
            .describe(
                'Grounded narrative digest of the retained thread, including task outcomes and epistemic status.',
            ),
        slug: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .describe('Stable lowercase kebab-case handle for the memory.'),
        title: z
            .string()
            .min(1)
            .max(120)
            .describe(
                'Concise human-readable title for the memory: a few plain-language words, not a slug.',
            ),
        raw_memory: z
            .string()
            .min(1)
            .max(6_000)
            .describe(
                'Applicable, durable, legible project memory grounded in the thread.',
            ),
        terms: z
            .array(z.string().min(1).max(100))
            .max(20)
            .describe(
                'Prompt-facing business words and phrases that should retrieve the memory.',
            ),
        objects: z
            .array(aiProjectContextTypedObjectRefSchema)
            .max(20)
            .describe(
                'Exact typed explore or field references seen in non-MCP Lightdash tool calls/results.',
            ),
        // Nullable rather than optional or defaulted: only `.nullable()` keeps
        // the property in the JSON schema's `required` set, which OpenAI
        // structured outputs demands.
        scope: z
            .enum(distillMemoryScopes)
            .nullable()
            .transform((scope) => scope ?? 'user')
            .describe(
                "'project' when the memory reads as project-general knowledge worth nominating for promotion review, 'user' when it reads as this user's own working preference. Use 'user', or null, whenever the signal is ambiguous.",
            ),
    })
    .strict();

export const distillOutputSchema = z
    .object({
        result: z.discriminatedUnion('type', [noOpSchema, memorySchema]),
    })
    .strict();

export type DistillOutput = z.infer<typeof distillOutputSchema>;
