import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ASSIGNMENT_IDX_KEY } from './constants';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier } from './utils';

const useChartColorMappingContext = (): ChartColorMappingContextProps => {
    const ctx = useContext(ChartColorMappingContext);

    if (ctx == null) {
        throw new Error(
            'useChartColorMappingContext must be used inside ChartColorMappingContextProvider ',
        );
    }

    return ctx;
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
                return theme.colors.ldGray[6];
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
