import { z } from 'zod';

export {
    discoverFieldsInputSchema,
    discoverFieldsResultSchema,
    type DiscoverFieldsInput,
    type DiscoverFieldsResult,
    type ToolDiscoverFieldsOutput,
} from '@lightdash/common';

const discoverFieldsSelectionCandidateSchemaV2 = z.object({
    exploreName: z.string(),
    reason: z.string(),
});

const discoverFieldsSelectionUnionSchemaV2 = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('resolved'),
        exploreName: z.string(),
        fieldIds: z.array(z.string()).min(1),
        rationale: z.string().nullable(),
    }),
    z.object({
        status: z.literal('ambiguous'),
        candidates: z.array(discoverFieldsSelectionCandidateSchemaV2).min(2),
        suggestedQuestion: z.string(),
    }),
    z.object({
        status: z.literal('no_match'),
        reason: z.string(),
    }),
]);

export const discoverFieldsSelectionSchemaV2 = z.object({
    handoff: discoverFieldsSelectionUnionSchemaV2,
});

export type DiscoverFieldsSelectionV2 = z.infer<
    typeof discoverFieldsSelectionUnionSchemaV2
>;
