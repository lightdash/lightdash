import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

/** Rows one listLiveSourceFields call returns; narrow with search past this. */
export const LIVE_SOURCE_FIELDS_TOOL_ROW_LIMIT = 50;

const connectionUuidSchema = z
    .string()
    .describe(
        'The live data source, by its connectionUuid from "Live data sources" in the system prompt.',
    );

export const TOOL_LIST_LIVE_SOURCE_FIELDS_DESCRIPTION = [
    "List a live data source's fields: the ones in use, which its explore has, and the available ones its integration offers that the explore leaves out.",
    'Use it when a question needs a field the explore lacks, to find it among the available fields.',
    `Returns at most ${LIVE_SOURCE_FIELDS_TOOL_ROW_LIMIT} fields; narrow a long list with search.`,
].join(' ');

export const toolListLiveSourceFieldsArgsSchema = z.object({
    connectionUuid: connectionUuidSchema,
    status: z
        .enum(['all', 'inUse', 'available'])
        .describe(
            'Which fields to list: "inUse" for the explore\'s fields, "available" for the ones it leaves out, "all" for both.',
        ),
    search: z
        .string()
        .nullable()
        .describe(
            'Words matched against each field\'s name, label, source and description, e.g. "plan" or "utm"; null lists every field.',
        ),
});

const liveSourceFieldRowSchema = z.object({
    name: z.string().describe('The field name.'),
    fieldId: z
        .string()
        .describe('The field id a query uses once the field is in use.'),
    label: z.string(),
    kind: z.enum(['dimension', 'metric']),
    type: z.string(),
    source: z.string().describe('What the integration calls the field.'),
    description: z.string(),
    aiHint: z.string().nullable(),
    group: z.string().nullable(),
    inUse: z.boolean(),
    isRequired: z
        .boolean()
        .describe('Every query needs it, so it always stays in use.'),
    isInternal: z
        .boolean()
        .describe("The integration's own bookkeeping field."),
    usedByChartCount: z.number().int(),
});

export const toolListLiveSourceFieldsStructuredContentSchema = z.object({
    exploreName: z.string(),
    matchCount: z
        .number()
        .int()
        .describe('Fields matching status and search, before the row limit.'),
    fields: z.array(liveSourceFieldRowSchema),
});

export const toolListLiveSourceFieldsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListLiveSourceFieldsStructuredContentSchema,
});

export type ToolListLiveSourceFieldsArgs = z.infer<
    typeof toolListLiveSourceFieldsArgsSchema
>;
export type ToolListLiveSourceFieldsStructuredContent = z.infer<
    typeof toolListLiveSourceFieldsStructuredContentSchema
>;
export type ToolListLiveSourceFieldsOutput = z.infer<
    typeof toolListLiveSourceFieldsOutputSchema
>;
