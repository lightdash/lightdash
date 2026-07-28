import {
    aiProjectContextTypedObjectRefSchema,
    type AiAgentMemoryConsolidationOperation,
} from '@lightdash/common';
import { z } from 'zod';

export const AI_AGENT_MEMORY_CONSOLIDATION_MAX_OPERATIONS = 30;

const slugSchema = z.string().min(1).max(120);

const mergeOperationSchema = z
    .object({
        type: z.literal('merge'),
        source_slugs: z
            .array(slugSchema)
            .min(2)
            .max(10)
            .describe('Ids of the memories this merge replaces.'),
        slug: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .describe(
                'Stable lowercase kebab-case handle for the merged memory.',
            ),
        title: z.string().min(1).max(120),
        memory: z
            .string()
            .min(1)
            .max(6_000)
            .describe(
                'Merged memory body, built from the sources’ own wording plus minimal glue.',
            ),
        terms: z.array(z.string().min(1).max(100)).max(20),
        objects: z
            .array(aiProjectContextTypedObjectRefSchema)
            .max(20)
            .describe('A subset of the union of the sources’ objects.'),
        reason: z.string().min(1).max(500),
    })
    .strict();

const supersedeOperationSchema = z
    .object({
        type: z.literal('supersede'),
        loser_slug: slugSchema.describe('Id of the memory being replaced.'),
        winner_slug: slugSchema.describe('Id of the memory that replaces it.'),
        reason: z.string().min(1).max(500),
    })
    .strict();

const retireOperationSchema = z
    .object({
        type: z.literal('retire'),
        slug: slugSchema,
        reason: z.string().min(1).max(500),
    })
    .strict();

export const consolidationOperationSchema = z.discriminatedUnion('type', [
    mergeOperationSchema,
    supersedeOperationSchema,
    retireOperationSchema,
]);

export const consolidationOutputSchema = z
    .object({
        operations: z
            .array(consolidationOperationSchema)
            .max(AI_AGENT_MEMORY_CONSOLIDATION_MAX_OPERATIONS)
            .describe(
                'Curation operations. An empty list is a valid, successful run.',
            ),
    })
    .strict();

// Declared rather than inferred: the LLM call returns the inferred shape into
// this type, so a schema that drifts from the domain union fails to compile.
export type ConsolidationOutput = {
    operations: AiAgentMemoryConsolidationOperation[];
};
