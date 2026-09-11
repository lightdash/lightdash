import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useEffect, useState, type ComponentProps } from 'react';
import { Provider } from 'react-redux';
import {
    MemoryRouter,
    Route,
    Routes,
    useLocation,
    useNavigate,
} from 'react-router';
import { describe, expect, it } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    useExplorerDispatch,
} from '../features/explorer/store';
import { renderWithProviders } from '../testing/testUtils';
import {
    getSavedChartEditUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
    parseDataAppVizUuidFromSearchParams,
    tryParseCreateSavedChartVersionParam,
    useExplorerRoute,
    useExplorerUrlState,
    useSavedChartEditRoute,
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

const renderExplorerRouteAt = (initialPath: string) => {
    window.history.replaceState({}, '', initialPath);

    renderWithProviders(
        createElement(
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
        ),
    );
};

/** Lets every queued navigation land, so a redundant one is visible. */
const settleNavigations = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 50)));

const currentDestination = () =>
    new URL(
        screen.getByTestId('location').textContent ?? '',
        'http://lightdash.local',
    );

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

    it('keeps the chart sidebar step in the URL when restored from query params', async () => {
        renderExplorerRouteAt(
            '/projects/project-1/tables/orders?chartSidebar=configure&fromSpace=space-1',
        );

        await waitFor(() => {
            const destination = currentDestination();
            expect(destination.pathname).toBe(
                '/projects/project-1/tables/orders',
            );
            expect(destination.searchParams.get('fromSpace')).toBe('space-1');
            expect(destination.searchParams.get('chartSidebar')).toBe(
                'configure',
            );
            expect(
                destination.searchParams.get('create_saved_chart_version'),
            ).not.toBeNull();
        });
    });

    it('restores the chart type gallery step from the URL', async () => {
        renderExplorerRouteAt(
            '/projects/project-1/tables/orders?chartSidebar=choose',
        );

        await waitFor(() => {
            expect(currentDestination().searchParams.get('chartSidebar')).toBe(
                'choose',
            );
        });
    });

    it('omits the chart sidebar param when the panel is closed', async () => {
        renderExplorerRouteAt(
            '/projects/project-1/tables/orders?fromSpace=space-1',
        );

        await waitFor(() => {
            const destination = currentDestination();
            expect(destination.pathname).toBe(
                '/projects/project-1/tables/orders',
            );
            expect(destination.searchParams.get('fromSpace')).toBe('space-1');
            expect(destination.searchParams.get('chartSidebar')).toBeNull();
            expect(
                destination.searchParams.get('create_saved_chart_version'),
            ).not.toBeNull();
        });
    });

    it('treats an unknown chart sidebar step as a closed panel', async () => {
        renderExplorerRouteAt(
            '/projects/project-1/tables/orders?chartSidebar=nope',
        );

        await waitFor(() => {
            expect(
                currentDestination().searchParams.get('chartSidebar'),
            ).toBeNull();
        });
    });
});

const savedRouteChartVersion = (
    tableName: string,
): CreateSavedChartVersion => ({
    tableName,
    metricQuery: {
        exploreName: tableName,
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: {}, eChartsConfig: {} },
    },
    tableConfig: { columnOrder: [] },
});

const SavedRouteLocation = ({ enabled }: { enabled: boolean }) => {
    useSavedChartEditRoute({ enabled });
    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const [locationWrites, setLocationWrites] = useState(0);

    useEffect(() => {
        setLocationWrites((writes) => writes + 1);
    }, [location]);

    return createElement(
        'div',
        null,
        createElement(
            'div',
            { 'data-testid': 'location' },
            `${location.pathname}${location.search}`,
        ),
        createElement(
            'div',
            { 'data-testid': 'location-writes' },
            String(locationWrites),
        ),
        createElement(
            'button',
            {
                type: 'button',
                onClick: () => dispatch(explorerActions.setRowLimit(42)),
            },
            'change the limit',
        ),
        createElement(
            'button',
            {
                type: 'button',
                onClick: () =>
                    void navigate(
                        { search: `${location.search}&other=1` },
                        { replace: true },
                    ),
            },
            'write another param',
        ),
    );
};

const SavedRouteHarness = ({
    tableName,
    enabled,
}: {
    tableName: string;
    enabled: boolean;
}) => {
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({
                initialState: {
                    unsavedChartVersion: savedRouteChartVersion(tableName),
                },
            }),
        }),
    );

    return createElement(
        Provider,
        { store } as ComponentProps<typeof Provider>,
        createElement(SavedRouteLocation, { enabled }),
    );
};

const renderSavedRouteAt = (
    initialPath: string,
    { tableName = 'payments', enabled = true, browserPath = '' } = {},
) => {
    // The params come from the router's location, never from the browser's
    window.history.replaceState(
        {},
        '',
        browserPath ||
            `${initialPath.split('?')[0]}?isExploreFromHere=true&stale=1`,
    );

    renderWithProviders(
        createElement(
            MemoryRouter,
            { initialEntries: [initialPath] },
            createElement(
                Routes,
                null,
                createElement(Route, {
                    path: '/projects/:projectUuid/saved/:savedQueryUuid/:mode',
                    element: createElement(SavedRouteHarness, {
                        tableName,
                        enabled,
                    }),
                }),
            ),
        ),
    );
};

describe('useSavedChartEditRoute', () => {
    it('writes the chart version when the store changes', async () => {
        const user = userEvent.setup();
        renderSavedRouteAt('/projects/project-1/saved/chart-1/edit');

        await waitFor(() =>
            expect(
                parseChartFromExplorerSearchParams(currentDestination().search)
                    ?.metricQuery.limit,
            ).toBe(500),
        );

        await user.click(screen.getByText('change the limit'));

        await waitFor(() =>
            expect(
                parseChartFromExplorerSearchParams(currentDestination().search)
                    ?.metricQuery.limit,
            ).toBe(42),
        );
    });

    it('keeps the params the page was opened with', async () => {
        renderSavedRouteAt(
            '/projects/project-1/saved/chart-1/edit?fromDashboard=dashboard-1&dateZoom=week&fromSpace=space-1',
        );

        await waitFor(() => {
            const destination = currentDestination();
            expect(destination.searchParams.get('fromDashboard')).toBe(
                'dashboard-1',
            );
            expect(destination.searchParams.get('dateZoom')).toBe('week');
            expect(destination.searchParams.get('fromSpace')).toBe('space-1');
            expect(
                destination.searchParams.get('create_saved_chart_version'),
            ).not.toBeNull();
        });
    });

    it('does not mark the session as explored from here', async () => {
        renderSavedRouteAt('/projects/project-1/saved/chart-1/edit');

        await waitFor(() =>
            expect(
                currentDestination().searchParams.get(
                    'create_saved_chart_version',
                ),
            ).not.toBeNull(),
        );
        expect(
            currentDestination().searchParams.get('isExploreFromHere'),
        ).toBeNull();
        expect(currentDestination().searchParams.get('stale')).toBeNull();
    });

    it('leaves a slug pathname untouched', async () => {
        renderSavedRouteAt(
            '/projects/jaffle-shop/saved/revenue-per-payment-method/edit',
        );

        await waitFor(() =>
            expect(
                currentDestination().searchParams.get(
                    'create_saved_chart_version',
                ),
            ).not.toBeNull(),
        );
        expect(currentDestination().pathname).toBe(
            '/projects/jaffle-shop/saved/revenue-per-payment-method/edit',
        );
    });

    it('writes nothing before the page resets the store', async () => {
        renderSavedRouteAt('/projects/project-1/saved/chart-1/edit', {
            tableName: '',
        });

        await settleNavigations();

        expect(screen.getByTestId('location-writes')).toHaveTextContent('1');
        expect(
            currentDestination().searchParams.get('create_saved_chart_version'),
        ).toBeNull();
    });

    it('writes nothing in view mode', async () => {
        renderSavedRouteAt('/projects/project-1/saved/chart-1/view', {
            enabled: false,
        });

        await settleNavigations();

        expect(screen.getByTestId('location-writes')).toHaveTextContent('1');
        expect(
            currentDestination().searchParams.get('create_saved_chart_version'),
        ).toBeNull();
    });

    it('does not write back a page the browser has already left', async () => {
        renderSavedRouteAt('/projects/project-1/saved/chart-1/edit', {
            browserPath: '/projects/project-1/saved/chart-1/view',
        });

        await settleNavigations();

        expect(screen.getByTestId('location-writes')).toHaveTextContent('1');
        expect(
            currentDestination().searchParams.get('create_saved_chart_version'),
        ).toBeNull();
    });

    it('does not navigate when another writer leaves the version alone', async () => {
        const user = userEvent.setup();
        renderSavedRouteAt('/projects/project-1/saved/chart-1/edit');

        await waitFor(() =>
            expect(screen.getByTestId('location-writes')).toHaveTextContent(
                '2',
            ),
        );

        await user.click(screen.getByText('write another param'));
        await settleNavigations();

        expect(currentDestination().searchParams.get('other')).toBe('1');
        // The foreign write only; the version is unchanged, so nothing follows it
        expect(screen.getByTestId('location-writes')).toHaveTextContent('3');
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

describe('getSavedChartEditUrlFromCreateSavedChartVersion', () => {
    const createSavedChart: CreateSavedChartVersion = {
        tableName: 'payments',
        metricQuery: {
            exploreName: 'payments',
            dimensions: ['payments_payment_method'],
            metrics: ['payments_total_revenue'],
            filters: {},
            sorts: [],
            limit: 25,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        },
        tableConfig: { columnOrder: [] },
    };

    it('carries the unsaved version and the dashboard to the edit route', () => {
        const { pathname, search } =
            getSavedChartEditUrlFromCreateSavedChartVersion({
                projectUuid: 'project-1',
                chartSlug: 'revenue-per-payment-method',
                createSavedChart,
                fromDashboardUuid: 'dashboard-1',
            });

        expect(pathname).toBe(
            '/projects/project-1/saved/revenue-per-payment-method/edit',
        );
        const params = new URLSearchParams(search);
        expect(params.get('fromDashboard')).toBe('dashboard-1');
        expect(parseChartFromExplorerSearchParams(`?${search}`)).toEqual(
            createSavedChart,
        );
    });

    it('omits the dashboard when the editor is not hosted in one', () => {
        const { search } = getSavedChartEditUrlFromCreateSavedChartVersion({
            projectUuid: 'project-1',
            chartSlug: 'revenue-per-payment-method',
            createSavedChart,
            fromDashboardUuid: null,
        });

        expect(new URLSearchParams(search).get('fromDashboard')).toBeNull();
    });

    it('does not inherit the current page search params', () => {
        window.history.replaceState({}, '', '/dashboard?fromSpace=space-1');

        const { search } = getSavedChartEditUrlFromCreateSavedChartVersion({
            projectUuid: 'project-1',
            chartSlug: 'revenue-per-payment-method',
            createSavedChart,
            fromDashboardUuid: null,
        });

        expect(new URLSearchParams(search).get('fromSpace')).toBeNull();
        expect(new URLSearchParams(search).get('isExploreFromHere')).toBeNull();
    });
});

describe('tryParseCreateSavedChartVersionParam', () => {
    it('ignores a malformed param instead of throwing', () => {
        expect(
            tryParseCreateSavedChartVersionParam('not-json'),
        ).toBeUndefined();
    });
});
