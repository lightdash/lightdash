import {
    Explore,
    getTotalFilterRules,
    ToolTableVizArgsTransformed,
} from '@lightdash/common';
import {
    validateCustomMetricsDefinition,
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
    const fieldsToValidate = [
        ...vizTool.vizConfig.dimensions,
        ...vizTool.vizConfig.metrics,
        ...vizTool.vizConfig.sorts.map((sortField) => sortField.fieldId),
    ].filter((x) => typeof x === 'string');
    validateSelectedFieldsExistence(
        explore,
        fieldsToValidate,
        vizTool.customMetrics,
    );
    validateCustomMetricsDefinition(explore, vizTool.customMetrics);
    validateFilterRules(explore, filterRules, vizTool.customMetrics);
    validateMetricDimensionFilterPlacement(
        explore,
        vizTool.filters,
        vizTool.customMetrics,
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
