import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type AdditionalMetric,
    type Item,
} from '@lightdash/common';

/**
 * Returns the color for a field icon based on the field type
 */
export const getFieldIconColor = (field: Item | AdditionalMetric) => {
    if (isCustomDimension(field) || isDimension(field)) return 'blue.9';
    if (isAdditionalMetric(field)) return 'yellow.9';
    if (isTableCalculation(field)) return 'green.9';
    if (isMetric(field)) return 'yellow.9';

    return 'yellow.9';
};
