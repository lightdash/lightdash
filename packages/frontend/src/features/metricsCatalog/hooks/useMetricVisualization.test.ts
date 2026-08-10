import {
    FieldType,
    MetricExplorerComparison,
    MetricType,
    TimeFrames,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExplore } from '../../../hooks/useExplore';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import { useMetric } from './useMetricsCatalog';
import { useMetricVisualization } from './useMetricVisualization';

vi.mock('../../../hooks/useExplore');
vi.mock('../../../providers/Explorer/useQueryExecutor');
vi.mock('./useMetricsCatalog');

const metric = {
    table: 'orders',
    name: 'total_sales',
    label: 'Total sales',
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    sql: '${TABLE}.amount',
    timeDimension: {
        table: 'orders',
        field: 'order_date',
        interval: TimeFrames.WEEK,
    },
} as MetricWithAssociatedTimeDimension;

const getMetric = (
    interval: TimeFrames,
): MetricWithAssociatedTimeDimension => ({
    ...metric,
    timeDimension: {
        table: 'orders',
        field: 'order_date',
        interval,
    },
});

describe('useMetricVisualization', () => {
    beforeEach(() => {
        vi.mocked(useMetric).mockReturnValue({
            data: metric,
            isLoading: false,
            error: null,
        } as ReturnType<typeof useMetric>);
        vi.mocked(useExplore).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
        } as unknown as ReturnType<typeof useExplore>);
        vi.mocked(useQueryExecutor).mockReturnValue([
            {
                query: {
                    data: undefined,
                    isFetching: false,
                    error: null,
                },
                queryResults: {
                    rows: [],
                    hasFetchedAllRows: true,
                    isFetchingFirstPage: false,
                    error: null,
                },
            },
            vi.fn(),
        ] as unknown as ReturnType<typeof useQueryExecutor>);
    });

    it('aligns weekly previous-year comparisons by 52 weeks', () => {
        const { result } = renderHook(() =>
            useMetricVisualization({
                projectUuid: 'project-uuid',
                tableName: 'orders',
                metricName: 'total_sales',
                comparison: MetricExplorerComparison.PREVIOUS_PERIOD,
            }),
        );

        expect(result.current.metricQuery?.additionalMetrics).toEqual([
            expect.objectContaining({
                generationType: 'periodOverPeriod',
                granularity: TimeFrames.WEEK,
                periodOffset: 52,
                label: 'Total sales (Previous year)',
            }),
        ]);
    });

    it.each([TimeFrames.DAY, TimeFrames.MONTH])(
        'keeps %s previous-year comparisons aligned by one year',
        (interval) => {
            vi.mocked(useMetric).mockReturnValue({
                data: getMetric(interval),
                isLoading: false,
                error: null,
            } as ReturnType<typeof useMetric>);

            const { result } = renderHook(() =>
                useMetricVisualization({
                    projectUuid: 'project-uuid',
                    tableName: 'orders',
                    metricName: 'total_sales',
                    comparison: MetricExplorerComparison.PREVIOUS_PERIOD,
                }),
            );

            expect(result.current.metricQuery?.additionalMetrics).toEqual([
                expect.objectContaining({
                    generationType: 'periodOverPeriod',
                    granularity: TimeFrames.YEAR,
                    periodOffset: 1,
                }),
            ]);
        },
    );

    it('does not add a comparison metric when comparison is disabled', () => {
        const { result } = renderHook(() =>
            useMetricVisualization({
                projectUuid: 'project-uuid',
                tableName: 'orders',
                metricName: 'total_sales',
                comparison: MetricExplorerComparison.NONE,
            }),
        );

        expect(result.current.metricQuery?.additionalMetrics).toBeUndefined();
        expect(result.current.metricQuery?.metrics).toEqual([
            'orders_total_sales',
        ]);
    });
});
