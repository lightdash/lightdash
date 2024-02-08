import { CompleteEChartsConfig, FeatureFlags, Series } from '@lightdash/common';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useCallback } from 'react';

export const useChartColorConfig = ({
    colorPalette,
}: {
    colorPalette: string[];
}) => {
    const useSharedColors = useFeatureFlagEnabled(
        FeatureFlags.UseSharedColorAssignment,
    );

    /**
     * Given the org's color palette, and a dimension identifier, return the color
     * in the palette assigned to that identifier.
     *
     * This works by hashing the identifier into an integer value, and then projecting
     * that value into the org's color space - effectivelly getting a number from 0 to
     * <number of colors in palette>.
     *
     * This is a straight-forward way to handle hashing dimensions into colors, with
     * two major caveats:
     *
     * - We're no longer cycling over colors in the palette, potentially not following
     *   an intentionally-designed best-neighbor-color approach.
     * - We have no guarantee different dimensions won't be assigned the same color due
     *   to the narrow color space - we can fix this by shifting colors aside when
     *   compiling the chart config.
     */
    const calculateDimensionColorAssignment = useCallback(
        (dimensionIdentifier: string, colorsToAvoid: Set<string>) => {
            const hashedValue = Math.abs(
                dimensionIdentifier.split('').reduce(function (a, b) {
                    a = (a << 5) - a + b.charCodeAt(0);
                    return a & a;
                }, 0),
            );

            const colorIdx = hashedValue % colorPalette.length;
            const colorHex = colorPalette[colorIdx];

            // Intersect colors we've already used with our color palette, and try to find the
            // next available color on the list.
            if (colorsToAvoid.has(colorHex)) {
                const intersection = colorPalette.filter(
                    (v) => !colorsToAvoid.has(v),
                );

                if (intersection.length > 0) {
                    return intersection[0];
                } else {
                    return colorHex;
                }
            }

            return colorHex;
        },
        [colorPalette],
    );

    const calculateSeriesColorAssignment = useCallback(
        (series: Series, colorsToAvoid: Set<string>) => {
            const { field: yField, pivotValues: yPivotValues } =
                series.encode.yRef;

            const baseDimension = yField;
            const pivotValuesSubPath =
                yPivotValues && yPivotValues.length > 0
                    ? `${yPivotValues[0].value}`
                    : null;

            const completeDimension = pivotValuesSubPath
                ? pivotValuesSubPath
                : baseDimension;

            return calculateDimensionColorAssignment(
                completeDimension,
                colorsToAvoid,
            );
        },
        [calculateDimensionColorAssignment],
    );

    const compileChartConfigWithColorAssignments = useCallback(
        (fullConfig: CompleteEChartsConfig) => {
            if (!useSharedColors) {
                return fullConfig;
            }

            /**
             * As a final safeguard against neighboring colors in a series,
             * we keep track of any colors we've seen in this chart, and for
             * any repeat offenders, we attempt to introduce a local offset.
             *
             * This means for this specific dimension, in this specific chart,
             * this color will be predictably offset every time, but will go
             * out of sync with surrounding charts in a dashboard.
             */
            const colorsInChart = new Set<string>();

            return {
                ...fullConfig,
                series: fullConfig.series.map((series) => {
                    const calculatedColor =
                        series.color ??
                        calculateSeriesColorAssignment(series, colorsInChart);

                    colorsInChart.add(calculatedColor);

                    return {
                        ...series,
                        color: calculatedColor,
                    };
                }),
            };
        },
        [useSharedColors, calculateSeriesColorAssignment],
    );

    return {
        calculateDimensionColorAssignment,
        calculateSeriesColorAssignment,
        compileChartConfigWithColorAssignments,
    };
};
