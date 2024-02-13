import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useCallback } from 'react';

/**
 * Generic series-like object that contains the relevant portions used
 * for color assignment. Requires the caller to unpack whatever series
 * format it has into this compatible one.
 */
interface SeriesLike {
    yField: string;
    yPivotValues?: string[];
}

export const useChartColorConfig = ({
    colorPalette,
}: {
    colorPalette: string[];
}) => {
    const useSharedColors = useFeatureFlagEnabled(
        FeatureFlags.UseSharedColorAssignment,
    );

    /**
     * Given the org's color palette, and an identifier, return the color palette value
     * for said identifier.
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
    const calculateKeyColorAssignment = useCallback(
        (identifier: string, colorsToAvoid: Set<string>) => {
            const hashedValue = Math.abs(
                identifier.split('').reduce(function (a, b) {
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
        ({ yField, yPivotValues }: SeriesLike, colorsToAvoid: Set<string>) => {
            const baseIdentifier = yField;
            const pivotValuesSubPath =
                yPivotValues && yPivotValues.length > 0
                    ? `${yPivotValues[0]}`
                    : null;

            const completeIdentifier = pivotValuesSubPath
                ? pivotValuesSubPath
                : baseIdentifier;

            return calculateKeyColorAssignment(
                completeIdentifier,
                colorsToAvoid,
            );
        },
        [calculateKeyColorAssignment],
    );

    return {
        useSharedColors,
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
    };
};
