import { z } from 'zod';

export {
    discoverFieldsInputSchema,
    type DiscoverFieldsInput,
    type DiscoverFieldsResult,
    type ToolDiscoverFieldsOutput,
} from '@lightdash/common';

const discoverFieldsCandidateSelectionSchema = z.object({
    exploreName: z.string().describe('Exact explore name from findExplores.'),
    reason: z
        .string()
        .describe('Why this explore is a plausible candidate for the query.'),
});

export const discoverFieldsSelectionSchema = z.object({
    handoff: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('resolved'),
            exploreName: z
                .string()
                .describe('Exact selected explore name from findExplores.'),
            dimensionIds: z
                .array(z.string())
                .describe(
                    'Selected dimension fieldIds returned by findFields.',
                ),
            metricIds: z
                .array(z.string())
                .describe('Selected metric fieldIds returned by findFields.'),
            rationale: z
                .string()
                .nullable()
                .describe(
                    'Brief justification for the selected explore and field IDs.',
                ),
        }),
        z.object({
            status: z.literal('ambiguous'),
            candidates: z
                .array(discoverFieldsCandidateSelectionSchema)
                .min(2)
                .describe(
                    'Plausible explores the parent should ask the user to disambiguate between.',
                ),
            suggestedQuestion: z
                .string()
                .describe(
                    'Clarification question the parent can echo to the user.',
                ),
        }),
        z.object({
            status: z.literal('no_match'),
            reason: z
                .string()
                .describe('Why no explore covers the user query.'),
        }),
    ]),
});

export type DiscoverFieldsSelectionResult = z.infer<
    typeof discoverFieldsSelectionSchema
>;
export type DiscoverFieldsSelection = DiscoverFieldsSelectionResult['handoff'];
