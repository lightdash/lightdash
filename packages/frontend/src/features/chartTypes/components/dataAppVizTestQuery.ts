import {
    getDataAppVizFieldIds,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';

/** True when every required declared field has a mapped query field id. */
export const isMappingComplete = (
    schema: DataAppVizSchema,
    fieldMapping: DataAppVizFieldMapping,
): boolean =>
    schema.fields.every(
        (f) =>
            !f.required ||
            getDataAppVizFieldIds(fieldMapping[f.name]).length > 0,
    );

/** Split the field mapping into a metric query. Series and dimension fields
 *  bind to query dimensions; metric fields to query metrics. */
export const buildTestMetricQuery = (
    exploreName: string,
    schema: DataAppVizSchema,
    fieldMapping: DataAppVizFieldMapping,
    itemsMap: ItemsMap = {},
): MetricQuery => ({
    exploreName,
    dimensions: schema.fields.flatMap((field) =>
        getDataAppVizFieldIds(fieldMapping[field.name]).filter((id) => {
            if (field.type === 'dimension' || field.type === 'series') {
                return true;
            }
            if (field.type === 'metric') return false;
            const item = itemsMap[id];
            return isDimension(item) || isCustomDimension(item);
        }),
    ),
    metrics: schema.fields.flatMap((field) =>
        getDataAppVizFieldIds(fieldMapping[field.name]).filter((id) => {
            if (field.type === 'metric') return true;
            if (field.type !== 'column') return false;
            const item = itemsMap[id];
            return isMetric(item) || isTableCalculation(item);
        }),
    ),
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});
