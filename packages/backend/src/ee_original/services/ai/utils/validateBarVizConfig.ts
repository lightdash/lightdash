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
    validateFieldEntityType(
        explore,
        vizTool.vizConfig.yMetrics,
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
        selectedDimensions,
        vizTool.vizConfig.yMetrics,
        vizTool.customMetrics,
        vizTool.tableCalculations,
    );
    validateTableCalculations(
        explore,
        vizTool.tableCalculations,
        selectedDimensions,
        vizTool.vizConfig.yMetrics,
        vizTool.customMetrics,
    );
};
