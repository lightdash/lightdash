import { Explore } from '../types/explore';
import {
    CompiledDimension,
    CompiledField,
    CompiledMetric,
    CustomDimension,
    Dimension,
    fieldId,
    Item,
    Metric,
    TableCalculation,
} from '../types/field';
import {
    AdditionalMetric,
    getCustomDimensionId,
    MetricQuery,
} from '../types/metricQuery';
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
): Record<string, Item | AdditionalMetric> => {
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
    const additionalMetrics = metricQuery.additionalMetrics?.reduce<
        Record<string, AdditionalMetric>
    >(
        (acc, additionalMetric) => ({
            ...acc,
            [getItemId(additionalMetric)]: additionalMetric,
        }),
        {},
    );
    const tableCalculations = metricQuery.tableCalculations.reduce<
        Record<string, TableCalculation>
    >(
        (acc, tableCalculation) => ({
            ...acc,
            [tableCalculation.name]: tableCalculation,
        }),
        {},
    );
    const customDimensions = metricQuery.customDimensions?.reduce<
        Record<string, CustomDimension>
    >(
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
