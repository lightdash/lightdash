import {
    ApiQueryResults,
    Explore,
    getItemId,
    ItemsMap,
} from '@lightdash/common';
import { MetricFlowJsonResults } from '../../../api/MetricFlowAPI';

export default function convertMetricFlowQueryResultsToResultsData(
    explore: Explore,
    metricFlowJsonResults: MetricFlowJsonResults,
) {
    const dimensionIdsInSchema = metricFlowJsonResults.schema.fields.map(
        ({ name }) => name.toLowerCase(),
    );
    const metricIdsInSchema = metricFlowJsonResults.schema.fields.map(
        ({ name }) => name.toLowerCase(),
    );

    const dimensionsInSchema = Object.values(
        explore.tables[explore.baseTable].dimensions,
    ).filter((dimension) => dimensionIdsInSchema.includes(dimension.name));
    const metricsInSchema = Object.values(
        explore.tables[explore.baseTable].metrics,
    ).filter((metric) => metricIdsInSchema.includes(metric.name));

    const resultsData: ApiQueryResults = {
        metricQuery: {
            exploreName: explore.name,
            dimensions: dimensionsInSchema.map(getItemId),
            metrics: metricsInSchema.map(getItemId),
            filters: {},
            sorts: [],
            limit: 0,
            tableCalculations: [],
        },
        cacheMetadata: {
            cacheHit: false,
        },
        rows: metricFlowJsonResults.data.map((row) =>
            Object.keys(row).reduce((acc, columnName) => {
                const raw = row[columnName];
                return {
                    ...acc,
                    [`${explore.baseTable}_${columnName.toLowerCase()}`]: {
                        value: {
                            raw,
                            formatted: `${raw}`,
                        },
                    },
                };
            }, {}),
        ),
        fields: [...dimensionsInSchema, ...metricsInSchema].reduce<ItemsMap>(
            (acc, field) => ({
                ...acc,
                [getItemId(field)]: field,
            }),
            {},
        ),
    };

    return resultsData;
}
