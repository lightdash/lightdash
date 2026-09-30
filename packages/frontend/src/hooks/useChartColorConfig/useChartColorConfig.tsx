import {
    calculateKeyColorAssignment,
    calculateSeriesColorAssignment,
    type SeriesLike,
} from '@lightdash/visualization/editor';
import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps } from './types';

/** The route's shared identifier -> color mappings. */
export const useChartColorMappings = (): ChartColorMappingContextProps => {
    const ctx = useContext(ChartColorMappingContext);

    if (ctx == null) {
        throw new Error(
            'useChartColorMappings must be used inside ChartColorMappingContextProvider ',
        );
    }

    return ctx;
};

/**
 * Shared color assignment for the charts on a page, backed by the route's
 * color mappings. The assignment itself lives in `@lightdash/visualization`.
 */
export const useChartColorConfig = ({
    colorPalette,
}: {
    colorPalette: string[];
}) => {
    const theme = useMantineTheme();
    const { colorMappings } = useChartColorMappings();
    const nullColor = theme.colors.ldGray[6];

    const calculateKeyColorAssignmentForGroup = useCallback(
        (group: string, identifier: string) =>
            calculateKeyColorAssignment(
                { colorPalette, colorMappings, nullColor },
                group,
                identifier,
            ),
        [colorPalette, colorMappings, nullColor],
    );

    const calculateSeriesColorAssignmentForSeries = useCallback(
        (series: SeriesLike) =>
            calculateSeriesColorAssignment(
                { colorPalette, colorMappings, nullColor },
                series,
            ),
        [colorPalette, colorMappings, nullColor],
    );

    return {
        calculateKeyColorAssignment: calculateKeyColorAssignmentForGroup,
        calculateSeriesColorAssignment: calculateSeriesColorAssignmentForSeries,
    };
};
