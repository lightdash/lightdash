import {
    Explore,
    getTotalFilterRules,
    ToolVerticalBarArgsTransformed,
} from '@lightdash/common';
import {
    validateCustomMetricsDefinition,
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
    const fieldsToValidate = [
        vizTool.vizConfig.xDimension,
        vizTool.vizConfig.breakdownByDimension,
        ...vizTool.vizConfig.yMetrics,
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
    const selectedDimensions = [
        vizTool.vizConfig.xDimension,
        vizTool.vizConfig.breakdownByDimension,
    ].filter((x) => typeof x === 'string');
    validateSortFieldsAreSelected(
        vizTool.vizConfig.sorts,
        selectedDimensions,
        vizTool.vizConfig.yMetrics,
        vizTool.customMetrics,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        vizTool.vizConfig.yMetrics,
        vizTool.customMetrics,
    );
};
