import { Series } from '@lightdash/common';
import { createContext, FC, useCallback, useContext, useRef } from 'react';
import { EChartSeries } from './echarts/useEchartsCartesianConfig';

export type SeriesLike = EChartSeries | Series;

interface ChartColorMappingContextProps {
    colorMappings: Map<string, string>;
}

const ChartColorMappingContext =
    createContext<ChartColorMappingContextProps | null>(null);

/**
 * Exposes a map of identifier->color values, which can be shared across
 * a context, for shared color assignment.
 */
export const ChartColorMappingContextProvider: FC<
    React.PropsWithChildren<{}>
> = ({ children }) => {
    /**
     * Changes to colorMappings are intentionally kept outside the React render loop,
     * we don't want to trigger re-renders for every mapping assignment, and we're
     * creating assignments during the render process anyway.
     */
    const colorMappings = useRef(new Map<string, string>());

    return (
        <ChartColorMappingContext.Provider
            value={{ colorMappings: colorMappings.current }}
        >
            {children}
        </ChartColorMappingContext.Provider>
    );
};

const useChartColorMappingContext = (): ChartColorMappingContextProps => {
    const ctx = useContext(ChartColorMappingContext);

    if (ctx == null) {
        throw new Error(
            'useChartColorMappingContext must be used inside ChartColorMappingContextProvider ',
        );
    }

    return ctx;
};

export const isGroupedSeries = (series: SeriesLike) => {
    return (
        (series as EChartSeries)?.pivotReference?.pivotValues != null ||
        (series as Series)?.encode.yRef.pivotValues != null
    );
};

export const useChartColorConfig = ({
    colorPalette,
}: {
    colorPalette: string[];
}) => {
    const { colorMappings } = useChartColorMappingContext();
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
        (identifier: string) => {
            if (colorMappings.has(identifier)) {
                return colorMappings.get(identifier)!;
            }

            const hashedValue = Math.abs(
                identifier.split('').reduce(function (a, b) {
                    a = (a << 5) - a + b.charCodeAt(0);
                    return a & a;
                }, 0),
            );

            // Project the hashed value into the available color space:
            const colorIdx = hashedValue % colorPalette.length;

            // Look at our existing color mappings so we can figure out if we need
            // to try and avoid any of the current colors:
            const colorsToAvoid = [...colorMappings.values()];
            let colorHex = colorPalette[colorIdx];

            // Intersect colors we've already used with our color palette, and try to find the
            // next available color on the list.
            if (colorsToAvoid.includes(colorHex)) {
                const intersection = colorPalette.filter(
                    (v) => !colorsToAvoid.includes(v),
                );

                if (intersection.length > 0) {
                    colorHex = intersection[0];
                }
            }

            // Keep track of this identifier->color pairing so we can reuse it without
            // treating it as a collision:
            colorMappings.set(identifier, colorHex);

            return colorHex;
        },
        [colorPalette, colorMappings],
    );

    const calculateSeriesColorAssignment = useCallback(
        (series: SeriesLike) => {
            const baseField =
                (series as Series).encode.yRef?.field ??
                (series as EChartSeries).encode?.x;

            const yPivotValues = (
                (series as EChartSeries)?.pivotReference?.pivotValues ??
                (series as Series)?.encode.yRef.pivotValues ??
                []
            ).map(({ value }) => `${value}`);

            const pivotValuesSubPath =
                yPivotValues && yPivotValues.length > 0
                    ? `${yPivotValues[0]}`
                    : null;

            const completeIdentifier = pivotValuesSubPath
                ? pivotValuesSubPath
                : baseField;

            return calculateKeyColorAssignment(completeIdentifier);
        },
        [calculateKeyColorAssignment],
    );

    return {
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
    };
};
