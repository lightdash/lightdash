import { type Explore } from '../types/explore';
import {
    fieldId,
    type CompiledDimension,
    type CompiledField,
    type CompiledMetric,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '../types/field';
import { getCustomDimensionId, type MetricQuery } from '../types/metricQuery';
import { convertAdditionalMetric } from './additionalMetrics';
import { getItemId } from './item';

// Helper function to get a list of all dimensions in an explore
export const getDimensions = (explore: Explore): CompiledDimension[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.dimensions));

// Helper function to get a list of all metrics in an explore
export const getMetrics = (explore: Explore): CompiledMetric[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.metrics));

export const getFields = (explore: Explore): CompiledField[] => [
    ...getDimensions(explore),
    ...getMetrics(explore),
];

export const getFieldsFromMetricQuery = (
    metricQuery: MetricQuery,
    explore: Explore,
): ItemsMap => {
    const exploreFields = getFields(explore);
    const fields = [...metricQuery.dimensions, ...metricQuery.metrics].reduce<
        Record<string, Dimension | Metric>
    >((acc, metricField) => {
        const field = exploreFields.find((f) => metricField === fieldId(f));
        if (field) {
            return { ...acc, [metricField]: field };
        }
        return acc;
    }, {});
    const additionalMetrics = (metricQuery.additionalMetrics || [])
        .filter((cd) => metricQuery.metrics.includes(getItemId(cd)))
        .reduce<Record<string, Metric>>((acc, additionalMetric) => {
            const table = explore.tables[additionalMetric.table];
            if (table) {
                const metric = convertAdditionalMetric({
                    additionalMetric,
                    table,
                });
                return { ...acc, [getItemId(additionalMetric)]: metric };
            }
            return acc;
        }, {});
    const tableCalculations = metricQuery.tableCalculations.reduce<
        Record<string, TableCalculation>
    >(
        (acc, tableCalculation) => ({
            ...acc,
            [tableCalculation.name]: tableCalculation,
        }),
        {},
    );
    const customDimensions = metricQuery.customDimensions
        ?.filter((cd) =>
            metricQuery.dimensions.includes(getCustomDimensionId(cd)),
        )
        .reduce<Record<string, CustomDimension>>(
            (acc, customDimension) => ({
                ...acc,
                [getCustomDimensionId(customDimension)]: customDimension,
            }),
            {},
        );
    return {
        ...fields,
        ...tableCalculations,
        ...customDimensions,
        ...additionalMetrics,
    };
};
