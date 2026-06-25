import { z } from 'zod';

export {
    discoverFieldsInputSchema,
    discoverFieldsResultSchema,
    type DiscoverFieldsInput,
    type DiscoverFieldsResult,
    type ToolDiscoverFieldsOutput,
} from '@lightdash/common';

const uncertaintiesSchema = z
    .string()
    .nullable()
    .describe(
        'Free-form uncertainties or caveats encountered during discovery. Use null when none.',
    );

const discoverFieldsSelectionCandidateSchemaV2 = z.object({
    exploreName: z.string(),
    reason: z.string(),
});

const discoverFieldsSelectionUnionSchemaV2 = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('resolved'),
        exploreName: z.string(),
        dimensionIds: z.array(z.string()),
        metricIds: z.array(z.string()),
        rationale: z.string().nullable(),
        uncertainties: uncertaintiesSchema,
    }),
    z.object({
        status: z.literal('ambiguous'),
        candidates: z.array(discoverFieldsSelectionCandidateSchemaV2).min(2),
        suggestedQuestion: z.string(),
        uncertainties: uncertaintiesSchema,
    }),
    z.object({
        status: z.literal('no_match'),
        reason: z.string(),
        uncertainties: uncertaintiesSchema,
    }),
]);

export const discoverFieldsSelectionSchemaV2 = z.object({
    handoff: discoverFieldsSelectionUnionSchemaV2,
});

export type DiscoverFieldsSelectionV2 = z.infer<
    typeof discoverFieldsSelectionUnionSchemaV2
>;
