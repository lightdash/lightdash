import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
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

            // Hash only the group to get a base offset, using djb2 to avoid collisions and ensure a consistent index
            const groupHash = Array.from(group).reduce(
                (acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0,
                0,
            );

            // Hash the identifier separately and add to the group offset, using djb2 to avoid collisions and ensure a consistent index
            const identifierHash = Array.from(identifier).reduce(
                (acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0,
                0,
            );

            // Give more weight to the identifier hash, so that it's more likely to be a different index within the same group
            const colorIdx =
                Math.abs(groupHash + identifierHash * 2) % colorPalette.length;
            const colorHex = colorPalette[colorIdx];

            // Keep track of the color idx used for this identifier, within this group:
            groupMappings.set(identifier, colorIdx);

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
