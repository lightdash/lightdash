import {
    Explore,
    filterAggregationCustomMetrics,
    getTotalFilterRules,
    ToolTableVizArgsTransformed,
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

export const validateTableVizConfig = (
    vizTool: ToolTableVizArgsTransformed,
    explore: Explore,
) => {
    const filterRules = getTotalFilterRules(vizTool.filters);
    const aggregations = filterAggregationCustomMetrics(vizTool.customMetrics);
    validateFieldEntityType(explore, vizTool.vizConfig.dimensions, 'dimension');
    validateFieldEntityType(
        explore,
        vizTool.vizConfig.metrics,
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
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        aggregations,
        vizTool.tableCalculations,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        aggregations,
    );
};
