import { z } from 'zod';
import { customChartTypeOptionValueSchema } from './toolRunQueryArgs';

const refSchema = z
    .string()
    .describe('A result column reference of the presented node');

const composerBuiltinChartVizTypeSchema = z.enum([
    'table',
    'big_number',
    'bar',
    'line',
    'area',
    'scatter',
    'pie',
    'funnel',
]);

export const composerBuiltinChartVizConfigSchemaV1 = z.object({
    type: composerBuiltinChartVizTypeSchema.describe(
        'Chart type. area is a filled line.',
    ),
    x: refSchema
        .nullable()
        .describe(
            'Category or time column. bar/line/area/scatter/pie/funnel. null for table/big_number, or to use the first non-numeric column.',
        ),
    y: z
        .array(refSchema)
        .nullable()
        .describe(
            'Value columns. big_number, pie and funnel use y[0]. null to use every numeric column not on x or groupBy.',
        ),
    groupBy: z
        .array(refSchema)
        .nullable()
        .describe(
            'Columns that split y into one series per value. bar/line/area/scatter only. Must not include x.',
        ),
    stack: z
        .boolean()
        .nullable()
        .describe(
            'bar: stack series on top of each other. area always stacks. Ignored elsewhere.',
        ),
    horizontal: z
        .boolean()
        .nullable()
        .describe('bar only: draw bars horizontally.'),
    y2: refSchema
        .nullable()
        .describe(
            'Column on a secondary (right) y axis. bar/line/area (drawn as a line on area). Must not be in y.',
        ),
    labels: z
        .object({
            x: z.string().nullable(),
            y: z.string().nullable(),
            y2: z.string().nullable(),
        })
        .nullable()
        .describe('Axis titles. big_number uses labels.y as its label.'),
});

const composerCustomChartVizConfigSchemaV1 = z.object({
    type: z.literal('custom').describe('Renders a custom chart type.'),
    customChartTypeSlug: z.string().describe('Slug of the custom chart type.'),
    fieldMapping: z
        .record(z.string(), z.union([refSchema, z.array(refSchema)]))
        .describe(
            'Binds each slot of the custom chart type to a column, or ordered columns for a multiple slot.',
        ),
    options: z
        .record(z.string(), customChartTypeOptionValueSchema)
        .nullable()
        .describe("Values for the type's options; null for defaults."),
});

const composerChartVizConfigSchemaV1 = z.discriminatedUnion('type', [
    composerBuiltinChartVizConfigSchemaV1,
    composerCustomChartVizConfigSchemaV1,
]);

/** The viz config the agent writes: the agent chart vocabulary over result column references. */
export const composerChartVizConfigSchema = composerChartVizConfigSchemaV1;

export type ComposerChartVizConfig = z.infer<
    typeof composerChartVizConfigSchema
>;

export type ComposerBuiltinChartVizConfig = z.infer<
    typeof composerBuiltinChartVizConfigSchemaV1
>;

export type ComposerCustomChartVizConfig = z.infer<
    typeof composerCustomChartVizConfigSchemaV1
>;

const composerStoredCustomChartVizConfigSchemaV1 =
    composerCustomChartVizConfigSchemaV1.extend({
        dataAppVizUuid: z.string(),
        dataAppVizVersion: z.number().nullable(),
    });

const composerStoredChartVizConfigSchemaV1 = z.discriminatedUnion('type', [
    composerBuiltinChartVizConfigSchemaV1,
    composerStoredCustomChartVizConfigSchemaV1,
]);

// Wide contract for parsing stored viz configs; call sites use this alias.
// Additive fields are `.nullish().default(null)` on the current version; a
// restructure adds V(N), bumps the composer artifact schemaVersion with it,
// and keeps this alias parsing everything ever stored.
export const composerChartVizConfigSchemaPersisted =
    composerStoredChartVizConfigSchemaV1;

/** Stored form: a custom chart type carries the version the server pinned. */
export type ComposerStoredChartVizConfig = z.infer<
    typeof composerChartVizConfigSchemaPersisted
>;

export type ComposerStoredCustomChartVizConfig = z.infer<
    typeof composerStoredCustomChartVizConfigSchemaV1
>;

export const parseComposerStoredChartVizConfig = (
    raw: unknown,
): ComposerStoredChartVizConfig | null => {
    const parsed = composerChartVizConfigSchemaPersisted.safeParse(raw);
    return parsed.success ? parsed.data : null;
};
