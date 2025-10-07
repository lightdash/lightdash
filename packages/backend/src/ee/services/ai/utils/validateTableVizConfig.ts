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
    validateFieldEntityType(explore, vizTool.vizConfig.metrics, 'metric');
    validateCustomMetricsDefinition(explore, vizTool.customMetrics);
    validateFilterRules(explore, filterRules, vizTool.customMetrics);
    validateMetricDimensionFilterPlacement(
        explore,
        vizTool.filters,
        vizTool.customMetrics,
    );
    validateSelectedFieldsExistence(
        explore,
        vizTool.vizConfig.sorts.map((sort) => sort.fieldId),
    );
    validateSortFieldsAreSelected(
        vizTool.vizConfig.sorts,
        vizTool.vizConfig.dimensions,
        vizTool.vizConfig.metrics,
        vizTool.customMetrics,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        vizTool.vizConfig.metrics,
        vizTool.customMetrics,
    );
};
