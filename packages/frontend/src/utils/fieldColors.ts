import {
    type AdditionalMetric,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type Item,
} from '@lightdash/common';
import { LD_FIELD_COLORS, type LightdashFieldColors } from '../mantineTheme';

/**
 * Returns the complete color theme for a field based on its type.
 *
 * Provides a comprehensive color palette including background, hover, font, and Mantine colors
 * for consistent field styling.
 *
 * @returns A LightdashFieldColors object containing:
 *          - background: Base background color (CSS variable)
 *          - hover: Hover state background color (CSS variable)
 *          - font: Text/foreground color (CSS variable)
 *          - mantineColor: Mantine component color token
 */
export const getFieldColors = (
    field: Item | AdditionalMetric,
): LightdashFieldColors => {
    if (isCustomDimension(field) || isDimension(field))
        return LD_FIELD_COLORS.dimension;
    if (isAdditionalMetric(field)) return LD_FIELD_COLORS.metric;
    if (isTableCalculation(field)) return LD_FIELD_COLORS.calculation;
    if (isMetric(field)) return LD_FIELD_COLORS.metric;

    return LD_FIELD_COLORS.DEFAULT;
};

/**
 * Returns color token for a field's icon or component styling.
 */
export const getMantineFieldColor = (
    field: Item | AdditionalMetric,
): LightdashFieldColors['color'] => getFieldColors(field).color;
