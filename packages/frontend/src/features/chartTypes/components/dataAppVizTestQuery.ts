import { type DataAppVizSchema, type MetricQuery } from '@lightdash/common';

/** True when every required declared field has a mapped query field id. */
export const isMappingComplete = (
    schema: DataAppVizSchema,
    fieldMapping: Record<string, string>,
): boolean =>
    schema.fields.every((f) => !f.required || Boolean(fieldMapping[f.name]));

/** Split the field mapping into a metric query. Series and dimension fields
 *  bind to query dimensions; metric fields to query metrics. */
export const buildTestMetricQuery = (
    exploreName: string,
    schema: DataAppVizSchema,
    fieldMapping: Record<string, string>,
): MetricQuery => ({
    exploreName,
    dimensions: schema.fields
        .filter((f) => f.type !== 'metric')
        .map((f) => fieldMapping[f.name])
        .filter(Boolean),
    metrics: schema.fields
        .filter((f) => f.type === 'metric')
        .map((f) => fieldMapping[f.name])
        .filter(Boolean),
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});
