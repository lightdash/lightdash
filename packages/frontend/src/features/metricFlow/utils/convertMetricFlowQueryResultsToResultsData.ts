import {
    getItemId,
    isDimension,
    isMetric,
    type ApiQueryResults,
    type Explore,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { type MetricFlowJsonResults } from '../../../api/MetricFlowAPI';

export default function convertMetricFlowQueryResultsToResultsData(
    explore: Explore,
    metricFlowJsonResults: MetricFlowJsonResults,
    metricQuery?: MetricQuery,
) {
    const fieldNamesInSchema = new Set(
        metricFlowJsonResults.schema.fields.map(({ name }) =>
            name.toLowerCase(),
        ),
    );
    const baseTable = explore.tables[explore.baseTable];

    const allDimensions = Object.values(explore.tables).flatMap((table) =>
        Object.values(table.dimensions),
    );
    const allMetrics = Object.values(explore.tables).flatMap((table) =>
        Object.values(table.metrics),
    );

    const dimensionsInSchema = allDimensions.filter((dimension) =>
        fieldNamesInSchema.has(dimension.name.toLowerCase()),
    );
    const metricsInSchema = allMetrics.filter((metric) =>
        fieldNamesInSchema.has(metric.name.toLowerCase()),
    );

    const fieldIdByName = new Map<string, string>();
    if (baseTable) {
        Object.values(baseTable.dimensions).forEach((dimension) => {
            fieldIdByName.set(
                dimension.name.toLowerCase(),
                getItemId(dimension),
            );
        });
        Object.values(baseTable.metrics).forEach((metric) => {
            fieldIdByName.set(metric.name.toLowerCase(), getItemId(metric));
        });
    }
    Object.values(explore.tables).forEach((table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            const name = dimension.name.toLowerCase();
            if (!fieldIdByName.has(name)) {
                fieldIdByName.set(name, getItemId(dimension));
            }
        });
        Object.values(table.metrics).forEach((metric) => {
            const name = metric.name.toLowerCase();
            if (!fieldIdByName.has(name)) {
                fieldIdByName.set(name, getItemId(metric));
            }
        });
    });

    const baseMetricQuery: MetricQuery = metricQuery ?? {
        exploreName: explore.name,
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 0,
        tableCalculations: [],
    };

    const resultsData: ApiQueryResults = {
        metricQuery: {
            ...baseMetricQuery,
            exploreName: explore.name,
            dimensions: dimensionsInSchema.map(getItemId),
            metrics: metricsInSchema.map(getItemId),
        },
        cacheMetadata: {
            cacheHit: false,
        },
        rows: metricFlowJsonResults.data.map((row) =>
            Object.keys(row).reduce((acc, columnName) => {
                const raw = row[columnName];
                const normalizedName = columnName.toLowerCase();
                const fieldId =
                    fieldIdByName.get(normalizedName) ??
                    `${explore.baseTable}_${normalizedName}`;
                return {
                    ...acc,
                    [fieldId]: {
                        value: {
                            raw,
                            formatted: `${raw}`,
                        },
                    },
                };
            }, {}),
        ),
        fields: [...dimensionsInSchema, ...metricsInSchema].reduce<ItemsMap>(
            (acc, field) => {
                const fieldId = getItemId(field);
                if (isDimension(field) || isMetric(field)) {
                    acc[fieldId] = field;
                }
                return acc;
            },
            {},
        ),
    };

    return resultsData;
}
