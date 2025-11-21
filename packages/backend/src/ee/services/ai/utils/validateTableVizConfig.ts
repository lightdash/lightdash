import {
    Explore,
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
    validateFieldEntityType(explore, vizTool.vizConfig.dimensions, 'dimension');
    validateFieldEntityType(
        explore,
        vizTool.vizConfig.metrics,
        'metric',
        vizTool.customMetrics,
    );
    validateCustomMetricsDefinition(explore, vizTool.customMetrics);
    validateFilterRules(
        explore,
        filterRules,
        vizTool.customMetrics,
        vizTool.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        vizTool.customMetrics,
        vizTool.tableCalculations,
        vizTool.filters,
    );
    // validate sort fields exist
    validateSelectedFieldsExistence(
        explore,
        vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
        vizTool.customMetrics,
        vizTool.tableCalculations,
    );
    validateSortFieldsAreSelected(
        vizTool.vizConfig.sorts,
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        vizTool.customMetrics,
        vizTool.tableCalculations,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        vizTool.customMetrics,
    );
};
