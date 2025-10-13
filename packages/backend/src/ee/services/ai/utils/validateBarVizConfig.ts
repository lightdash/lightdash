import {
    Explore,
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
    validateFieldEntityType(explore, selectedDimensions, 'dimension');
    validateFieldEntityType(explore, vizTool.vizConfig.yMetrics, 'metric');
    validateCustomMetricsDefinition(explore, vizTool.customMetrics);
    validateFilterRules(
        explore,
        filterRules,
        vizTool.customMetrics,
        vizTool.tableCalculations,
    );
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
