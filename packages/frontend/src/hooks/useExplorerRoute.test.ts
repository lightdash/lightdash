import { ChartType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { createElement, useState, type ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../features/explorer/store';
import { renderWithProviders } from '../testing/testUtils';
import {
    parseChartFromExplorerSearchParams,
    parseDataAppVizUuidFromSearchParams,
    useExplorerRoute,
    useExplorerUrlState,
} from './useExplorerRoute';

const searchFromPayload = (payload: unknown) =>
    `?create_saved_chart_version=${encodeURIComponent(
        JSON.stringify(payload),
    )}`;

const ExplorerRouteLocation = () => {
    useExplorerRoute();
    const location = useLocation();

    return createElement(
        'div',
        { 'data-testid': 'location' },
        `${location.pathname}${location.search}`,
    );
};

const ExplorerRouteHarness = () => {
    const explorerUrlState = useExplorerUrlState();
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({
                initialState: explorerUrlState,
            }),
        }),
    );

    return createElement(
        Provider,
        { store } as ComponentProps<typeof Provider>,
        createElement(ExplorerRouteLocation),
    );
};

describe('useExplorerRoute', () => {
    it('applies and consumes a chart type preview hint when it serializes chart state', async () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        const initialPath = `/projects/project-1/tables/orders?dataAppVizUuid=${dataAppVizUuid}&fromSpace=space-1`;
        window.history.replaceState({}, '', initialPath);

        const router = createElement(
            MemoryRouter,
            { initialEntries: [initialPath] },
            createElement(
                Routes,
                null,
                createElement(Route, {
                    path: '/projects/:projectUuid/tables/:tableId',
                    element: createElement(ExplorerRouteHarness),
                }),
            ),
        );
        renderWithProviders(router);

        await waitFor(() => {
            const destination = new URL(
                screen.getByTestId('location').textContent ?? '',
                'http://lightdash.local',
            );
            expect(destination.pathname).toBe(
                '/projects/project-1/tables/orders',
            );
            expect(destination.searchParams.get('fromSpace')).toBe('space-1');
            expect(destination.searchParams.get('dataAppVizUuid')).toBeNull();
            const serializedChart = parseChartFromExplorerSearchParams(
                destination.search,
            );
            expect(serializedChart?.tableName).toBe('orders');
            expect(serializedChart?.chartConfig).toEqual({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid,
                    fieldMapping: {},
                    optionValues: {},
                },
            });
        });
    });
});

describe('parseChartFromExplorerSearchParams', () => {
    it('returns undefined when the param is absent', () => {
        expect(parseChartFromExplorerSearchParams('')).toBeUndefined();
    });

    it('defaults missing state keys instead of crashing', () => {
        // Regression: agent-generated share links carried payloads with only
        // a metricQuery — no chartConfig/tableConfig/tableCalculations — and
        // the explorer crashed reading `chartConfig.type` on load
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total'],
                    sorts: [{ fieldId: 'orders_total', descending: true }],
                    limit: 500,
                },
            }),
        );

        expect(parsed).toBeDefined();
        expect(parsed!.chartConfig).toEqual({
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        });
        expect(parsed!.tableConfig).toEqual({ columnOrder: [] });
        expect(parsed!.metricQuery.filters).toEqual({});
        expect(parsed!.metricQuery.tableCalculations).toEqual([]);
    });

    it('defaults missing metricQuery arrays', () => {
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: { exploreName: 'orders', limit: 500 },
            }),
        );

        expect(parsed!.metricQuery.dimensions).toEqual([]);
        expect(parsed!.metricQuery.metrics).toEqual([]);
        expect(parsed!.metricQuery.sorts).toEqual([]);
    });

    it('falls back to tableName when exploreName is missing', () => {
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: { dimensions: [], metrics: [], limit: 500 },
            }),
        );

        expect(parsed!.metricQuery.exploreName).toBe('orders');
    });

    it('keeps provided state untouched', () => {
        const chartConfig = {
            type: ChartType.TABLE,
            config: { showColumnCalculation: false },
        };
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig,
                tableConfig: { columnOrder: ['orders_status'] },
            }),
        );

        expect(parsed!.chartConfig).toEqual(chartConfig);
        expect(parsed!.tableConfig).toEqual({
            columnOrder: ['orders_status'],
        });
        expect(parsed!.metricQuery.limit).toBe(100);
    });
});

describe('parseDataAppVizUuidFromSearchParams', () => {
    it('returns the uuid a preview link carries', () => {
        expect(
            parseDataAppVizUuidFromSearchParams(
                '?dataAppVizUuid=1e9a3b2c-0000-4000-8000-000000000001',
            ),
        ).toBe('1e9a3b2c-0000-4000-8000-000000000001');
    });

    it('returns null when the param is absent', () => {
        expect(parseDataAppVizUuidFromSearchParams('')).toBeNull();
    });

    it('ignores values that are not uuids', () => {
        expect(
            parseDataAppVizUuidFromSearchParams('?dataAppVizUuid=not-a-uuid'),
        ).toBeNull();
    });
});
