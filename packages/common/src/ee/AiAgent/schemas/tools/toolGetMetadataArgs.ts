import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { toolNameFor } from './discoveryToolNames';
import { findExploresRequiredFilterSchema } from './toolFindExploresArgs';

export const GET_METADATA_DESCRIPTION = ({
    runtime,
}: ToolDescriptionContext): string => {
    const getMetadata = toolNameFor('getMetadata', runtime);
    const grepFields = toolNameFor('grepFields', runtime);
    const visualization = toolNameFor('generateVisualization', runtime);
    return `Tool: ${getMetadata}

Purpose:
Get the full metadata for specific explores and/or fields that you already know the IDs of (typically from ${grepFields}). ${grepFields} is lean — it tells you WHICH fields exist; ${getMetadata} gives you the DETAIL you need to build a correct query: an explore's joined tables and table filters, and a field's filter type, case-sensitivity, resolved default time dimension, hints, and whether it comes from a joined table.

Call this AFTER ${grepFields}, once you have narrowed down to the explore(s) and field(s) you intend to use, and BEFORE ${visualization}. You can ask for several explores and several fields across explores in a SINGLE call — batch everything you need at once instead of one request per item.

Each entry in \`requests\` is one of:
- \`{ "type": "explore", "exploreIds": ["orders", "customers"] }\` — full metadata for those explores (joined tables, table filters, field counts).
- \`{ "type": "field", "fields": [{ "exploreId": "orders", "fieldId": "orders_status" }] }\` — full metadata for those specific fields.
`;
};

const exploreMetadataRequestSchema = z.object({
    type: z.literal('explore'),
    exploreIds: z
        .array(z.string().min(1))
        .min(1)
        .describe('Explore IDs (names) to fetch full metadata for.'),
});

const fieldMetadataRequestSchema = z.object({
    type: z.literal('field'),
    fields: z
        .array(
            z.object({
                exploreId: z
                    .string()
                    .min(1)
                    .describe('The explore the field belongs to.'),
                fieldId: z
                    .string()
                    .min(1)
                    .describe('The fieldId, e.g. `orders_status`.'),
            }),
        )
        .min(1)
        .describe('Specific fields to fetch full metadata for.'),
});

export const getMetadataInputSchema = z.object({
    requests: z
        .array(
            z.discriminatedUnion('type', [
                exploreMetadataRequestSchema,
                fieldMetadataRequestSchema,
            ]),
        )
        .min(1)
        .max(20)
        .describe(
            'A batch of explore and/or field metadata requests, resolved together in one call.',
        ),
});

export type ToolGetMetadataArgs = z.infer<typeof getMetadataInputSchema>;

const getMetadataExploreFoundSchema = z.object({
    exploreId: z.string(),
    status: z.literal('found'),
    label: z.string(),
    description: z.string().nullable(),
    hint: z.string().nullable(),
    baseTable: z.string(),
    joinedTables: z.array(z.string()),
    requiredFilters: z.array(findExploresRequiredFilterSchema),
    baseDimensions: z.object({
        count: z.number(),
        fieldIds: z.array(z.string()),
    }),
    baseMetrics: z.object({
        count: z.number(),
        fieldIds: z.array(z.string()),
    }),
});

const getMetadataExploreNotFoundSchema = z.object({
    exploreId: z.string(),
    status: z.literal('not_found'),
    error: z.string(),
});

const getMetadataFieldFoundSchema = z.object({
    exploreId: z.string(),
    fieldId: z.string(),
    status: z.literal('found'),
    kind: z.enum(['dimension', 'metric']),
    fieldType: z.string(),
    label: z.string(),
    filterType: z.string(),
    isFromJoinedTable: z.boolean(),
    joinedTableName: z.string().nullable(),
    caseSensitiveFilters: z.boolean().nullable(),
    defaultTimeDimension: z.string().nullable(),
    defaultTimeDimensionGranularity: z.string().nullable(),
    description: z.string().nullable(),
    hint: z.string().nullable(),
});

const getMetadataFieldNotFoundSchema = z.object({
    exploreId: z.string(),
    fieldId: z.string(),
    status: z.literal('not_found'),
    error: z.string(),
});

export const getMetadataResultSchema = z.object({
    explores: z.array(
        z.union([
            getMetadataExploreFoundSchema,
            getMetadataExploreNotFoundSchema,
        ]),
    ),
    fields: z.array(
        z.union([getMetadataFieldFoundSchema, getMetadataFieldNotFoundSchema]),
    ),
});

export const toolGetMetadataOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type GetMetadataResult = z.infer<typeof getMetadataResultSchema>;
export type ToolGetMetadataOutput = z.infer<typeof toolGetMetadataOutputSchema>;
