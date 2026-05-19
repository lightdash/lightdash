import {
    Explore,
    filterAggregationCustomMetrics,
    getTotalFilterRules,
    ToolVerticalBarArgsTransformed,
} from '@lightdash/common';
import {
    validateCustomMetricsDefinition,
    validateFieldEntityType,
    validateFilterRules,
    validateMetricDimensionFilterPlacement,
    validateSelectedFieldsExistence,
    validateSortFieldsAreSelected,
    validateTableCalculations,
} from './validators';

export const validateBarVizConfig = (
    vizTool: ToolVerticalBarArgsTransformed,
    explore: Explore,
) => {
    const filterRules = getTotalFilterRules(vizTool.filters);
    const selectedDimensions = [
        vizTool.vizConfig.xDimension,
        vizTool.vizConfig.breakdownByDimension,
    ].filter((x) => typeof x === 'string');
    const aggregations = filterAggregationCustomMetrics(vizTool.customMetrics);
    validateFieldEntityType(explore, selectedDimensions, 'dimension');
    validateFieldEntityType(
        explore,
        vizTool.vizConfig.yMetrics,
        'metric',
        aggregations,
    );
    validateCustomMetricsDefinition(explore, aggregations);
    validateFilterRules(
        explore,
        filterRules,
        aggregations,
        vizTool.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        aggregations,
        vizTool.tableCalculations,
        vizTool.filters,
    );
    // validate sort fields exist
    validateSelectedFieldsExistence(
        explore,
        vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
        aggregations,
        vizTool.tableCalculations,
    );
    validateSortFieldsAreSelected(
        vizTool.vizConfig.sorts,
        selectedDimensions,
        vizTool.vizConfig.yMetrics,
        aggregations,
        vizTool.tableCalculations,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        selectedDimensions,
        vizTool.vizConfig.yMetrics,
        aggregations,
    );
};
