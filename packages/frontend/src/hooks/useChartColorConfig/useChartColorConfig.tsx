import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier, hashStringToIndex } from './utils';

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

    // Returns a color for a group/identifier pair.
    const calculateKeyColorAssignment = useCallback(
        (group: string, identifier: string) => {
            // Null values always get gray
            if (!identifier || identifier === 'null') {
                return theme.colors.ldGray[6];
            }

            let groupMappings = colorMappings.get(group);

            // Return existing color if already assigned
            if (groupMappings && groupMappings.has(identifier)) {
                return colorPalette[groupMappings.get(identifier)!];
            }

            // Create group if first time seeing it
            if (!groupMappings) {
                groupMappings = new Map<string, number>();
                colorMappings.set(group, groupMappings);
            }

            // Use hash for deterministic color assignment
            const colorIdx = hashStringToIndex(identifier, colorPalette.length);
            groupMappings.set(identifier, colorIdx);
            return colorPalette[colorIdx];
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

    // Pre-registers series for color assignment with per-chart collision handling.
    // - Hash determines base color (deterministic across reloads)
    // - Collisions within a chart are resolved by probing
    // - Probed results are stored in Map so same series gets same color across charts
    const registerSeriesForColorAssignment = useCallback(
        (series: SeriesLike[]) => {
            const usedIndicesInChart = new Set<number>();

            series.forEach((s) => {
                const [group, identifier] = calculateSeriesLikeIdentifier(s);

                if (!identifier || identifier === 'null') return;

                let groupMappings = colorMappings.get(group);

                // If already in Map, use that color (cross-chart consistency)
                if (groupMappings && groupMappings.has(identifier)) {
                    usedIndicesInChart.add(groupMappings.get(identifier)!);
                    return;
                }

                // Create group if needed
                if (!groupMappings) {
                    groupMappings = new Map<string, number>();
                    colorMappings.set(group, groupMappings);
                }

                // Hash-based assignment with per-chart collision handling
                let colorIdx = hashStringToIndex(
                    identifier,
                    colorPalette.length,
                );

                // Probe for next available if collision within THIS chart
                let probeCount = 0;
                while (
                    usedIndicesInChart.has(colorIdx) &&
                    probeCount < colorPalette.length
                ) {
                    colorIdx = (colorIdx + 1) % colorPalette.length;
                    probeCount++;
                }

                groupMappings.set(identifier, colorIdx);
                usedIndicesInChart.add(colorIdx);
            });
        },
        [colorMappings, colorPalette.length],
    );

    return {
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
        registerSeriesForColorAssignment,
    };
};
