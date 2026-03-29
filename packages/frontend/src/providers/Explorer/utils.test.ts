import {
    CartesianSeriesType,
    ChartType,
    type ChartConfig,
    type Series,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { cleanConfig } from './utils';

describe('cleanConfig', () => {
    test('should strip isFilteredOut from cartesian series', () => {
        const seriesWithFilteredOut: Series[] = [
            {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'status', value: 'active' }],
                    },
                },
                isFilteredOut: true,
            },
            {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'status', value: 'inactive' }],
                    },
                },
            },
        ];

        const config: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'date', yField: ['metric'] },
                eChartsConfig: { series: seriesWithFilteredOut },
                columnLimit: 1,
            },
        } as ChartConfig;

        const cleaned = cleanConfig(config);

        if (
            cleaned.type === ChartType.CARTESIAN &&
            cleaned.config?.eChartsConfig?.series
        ) {
            const series = cleaned.config.eChartsConfig.series;

            // isFilteredOut should be stripped from all series
            series.forEach((s: Series) => {
                expect(s).not.toHaveProperty('isFilteredOut');
            });

            // columnLimit should be preserved (it's a user setting, not runtime state)
            expect(cleaned.config.columnLimit).toBe(1);

            // Series should still be present (not removed)
            expect(series).toHaveLength(2);
        } else {
            throw new Error('Expected cartesian config');
        }
    });

    test('should preserve all other series properties when stripping isFilteredOut', () => {
        const series: Series[] = [
            {
                type: CartesianSeriesType.LINE,
                yAxisIndex: 1,
                hidden: true,
                smooth: true,
                encode: {
                    xRef: { field: 'date' },
                    yRef: { field: 'metric' },
                },
                isFilteredOut: true,
            },
        ];

        const config: ChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'date', yField: ['metric'] },
                eChartsConfig: { series },
            },
        } as ChartConfig;

        const cleaned = cleanConfig(config);

        if (
            cleaned.type === ChartType.CARTESIAN &&
            cleaned.config?.eChartsConfig?.series
        ) {
            const cleanedSeries = cleaned.config.eChartsConfig.series[0];
            expect(cleanedSeries).not.toHaveProperty('isFilteredOut');
            expect(cleanedSeries.hidden).toBe(true);
            expect(cleanedSeries.smooth).toBe(true);
            expect(cleanedSeries.yAxisIndex).toBe(1);
            expect(cleanedSeries.type).toBe(CartesianSeriesType.LINE);
        } else {
            throw new Error('Expected cartesian config');
        }
    });
});
