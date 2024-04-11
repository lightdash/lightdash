import { type Series } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    type FC,
} from 'react';
import { useLocation } from 'react-router-dom';
import { type EChartSeries } from './echarts/useEchartsCartesianConfig';

/**
 * A unique key used to track the latest index assigned within a group,
 * within the color mappings Map.
 */
const ASSIGNMENT_IDX_KEY = '$___idx';

interface ChartColorMappingContextProps {
    colorMappings: Map<string, Map<string, number>>;
}

/**
 * There's some variation in what Series object we may be working with.
 */
export type SeriesLike = EChartSeries | Series;

const ChartColorMappingContext =
    createContext<ChartColorMappingContextProps | null>(null);

/**
 * Exposes a map of identifier->color values, which can be shared across
 * a context, for shared color assignment.
 */
export const ChartColorMappingContextProvider: FC<
    React.PropsWithChildren<{}>
> = ({ children }) => {
    const location = useLocation();

    /**
     * Changes to colorMappings are intentionally kept outside the React render loop,
     * we don't want to trigger re-renders for every mapping assignment, and we're
     * creating assignments during the render process anyway.
     */
    const colorMappings = useRef(new Map<string, Map<string, number>>());

    /**
     * Any time the path changes, if we have any color mappings in the context,
     * we reset them completely. This prevents things like playing around with
     * filters, or editing a chart, from 'polluting' the mappings table in
     * unpredictable ways.
     *
     * This could alternatively be implemented as contexts further down the tree,
     * but this approach ensures mappings are always shared at the highest possible
     * level regardless of how/where a chart is being rendered.
     */
    useEffect(() => {
        if (colorMappings.current.size > 0) {
            colorMappings.current = new Map<string, Map<string, number>>();
        }
    }, [location.pathname]);

    return (
        <ChartColorMappingContext.Provider
            value={{
                colorMappings: colorMappings.current,
            }}
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

export const calculateSeriesLikeIdentifier = (series: SeriesLike) => {
    const baseField =
        (series as EChartSeries).pivotReference?.field ??
        (series as Series).encode.yRef?.field;

    const pivotValues = (
        (series as EChartSeries)?.pivotReference?.pivotValues ??
        (series as Series)?.encode.yRef.pivotValues ??
        []
    ).map(({ value }) => `${value}`);

    const pivotValuesSubPath =
        pivotValues && pivotValues.length > 0
            ? `${pivotValues.join('.')}`
            : null;

    /**
     * When dealing with flipped axis, Echarts will include the pivot value as
     * part of the field identifier - we want to remove it for the purposes of
     * color mapping if that's the case, so that we continue to have a mapping
     * that looks like:
     *
     *  basefield->pivot_value
     *
     * instead of:
     *
     *  basefield.pivot_value -> pivot_value
     *
     * (which would be a grouping of 1 per pivot value, causing all values to
     * be assigned the first color)
     */
    const baseFieldPathParts = baseField.split('.');

    const baseFieldPath =
        pivotValuesSubPath && baseFieldPathParts.at(-1) === pivotValuesSubPath
            ? baseFieldPathParts.slice(0, -1).join('.')
            : baseField;

    const completeIdentifier = pivotValuesSubPath
        ? pivotValuesSubPath
        : baseFieldPath;

    return [
        `${baseFieldPath}${
            /**
             * If we have more than one pivot value, we append the number of pivot values
             * to the group identifier, giving us a unique group per number of values.
             *
             * This is not critical, but gives us better serial color assignment when
             * switching between number of groups, since we're not tacking each group
             * configuration on top of eachother (under the same identifier).
             */
            pivotValues.length === 1 ? '' : `${`_n${pivotValues.length}`}`
        }`,
        completeIdentifier,
    ];
};

export const useChartColorConfig = ({
    colorPalette,
}: {
    colorPalette: string[];
}) => {
    const theme = useMantineTheme();
    const { colorMappings } = useChartColorMappingContext();

    /**
     * Given the org's color palette, and an identifier, return the color palette value
     * for said identifier.
     *
     * This works by taking a group and identifier, and cycling through the color palette
     * colors on a first-come first-serve basis, scoped to a particular group of identifiers.
     *
     * 'Group' will generally be something like a table or model name, e.g 'customer',
     * 'Identifier' will generally be something like a field name, or a group value.
     *
     * Because this color cycling is done per group, it allows unrelated charts/series
     * to cycle through colors in the palette in parallel.
     */
    const calculateKeyColorAssignment = useCallback(
        (group: string, identifier: string) => {
            // Ensure we always color null the same:
            if (!identifier || identifier === 'null') {
                return theme.colors.gray[6];
            }

            let groupMappings = colorMappings.get(group);

            /**
             * If we already picked a color for this group/identifier pair, return it:
             */
            if (groupMappings && groupMappings.has(identifier)) {
                return colorPalette[groupMappings.get(identifier)!];
            }

            /**
             * If this is the first time we're seeing this group, create a sub-map for it:
             */
            if (!groupMappings) {
                groupMappings = new Map<string, number>();
                colorMappings.set(group, groupMappings);
            }

            /**
             * Figure out the last color assigned in this group, and either pick the
             * next color in the palette, or start over from 0.
             */
            const currentIdx = groupMappings.get(ASSIGNMENT_IDX_KEY) ?? -1;
            const nextIdx =
                currentIdx === colorPalette.length - 1 ? 0 : currentIdx + 1;
            const colorHex = colorPalette[nextIdx];

            // Keep track of the current value of the color idx for this group:
            groupMappings.set(ASSIGNMENT_IDX_KEY, nextIdx);

            // Keep track of the color idx used for this identifier, within this group:
            groupMappings.set(identifier, nextIdx);

            return colorHex;
        },
        [colorPalette, colorMappings, theme],
    );

    const calculateSeriesColorAssignment = useCallback(
        (series: SeriesLike) => {
            const [baseField, completeIdentifier] =
                calculateSeriesLikeIdentifier(series);

            return calculateKeyColorAssignment(baseField, completeIdentifier);
        },
        [calculateKeyColorAssignment],
    );

    return {
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
    };
};
