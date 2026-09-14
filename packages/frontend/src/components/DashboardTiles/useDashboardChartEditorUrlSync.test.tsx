import {
    CartesianSeriesType,
    ChartType,
    type SavedChart,
} from '@lightdash/common';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import { mockSavedChartResponse } from '../../testing/savedChartResponse.mock';
import { buildDashboardEditorInitialState } from './buildDashboardEditorInitialState';
import {
    CREATE_SAVED_CHART_VERSION_SEARCH_PARAM,
    useDashboardChartEditorUrlSync,
} from './useDashboardChartEditorUrlSync';

const editChart = mockSavedChartResponse();

// Renders the hook, exposes the resulting url and offers the two edits the
// tests drive the session with.
const Probe = () => {
    useDashboardChartEditorUrlSync();
    const location = useLocation();
    const dispatch = useExplorerDispatch();
    return (
        <div>
            <div data-testid="search">{location.search}</div>
            <div data-testid="location-key">{location.key}</div>
            <button
                type="button"
                onClick={() => dispatch(explorerActions.setRowLimit(25))}
            >
                Edit
            </button>
            <button
                type="button"
                onClick={() => dispatch(explorerActions.setRowLimit(500))}
            >
                Revert
            </button>
        </div>
    );
};

const renderSync = (
    initialSearch: string = '',
    chart: SavedChart = editChart,
) => {
    const store = createExplorerStore({
        explorer: buildDashboardEditorInitialState({
            exploreId: 'payments',
            editChart: chart,
            seededMetrics: [],
        }),
    });
    render(
        <MemoryRouter initialEntries={[`/dashboard${initialSearch}`]}>
            <Provider store={store}>
                <Probe />
            </Provider>
        </MemoryRouter>,
    );
    return { store };
};

const chartVersionFromUrl = () => {
    const search = screen.getByTestId('search').textContent ?? '';
    const value = new URLSearchParams(search).get(
        CREATE_SAVED_CHART_VERSION_SEARCH_PARAM,
    );
    return value === null ? null : JSON.parse(value);
};

describe('useDashboardChartEditorUrlSync', () => {
    it('trims large chart styling like the Explorer URL while preserving query edits', async () => {
        const user = userEvent.setup();
        const series = Array.from({ length: 20 }, (_, index) => ({
            encode: {
                xRef: { field: 'payments_payment_method' },
                yRef: { field: `payments_metric_${index}` },
            },
            type: CartesianSeriesType.BAR,
            name: `Series ${index} with a descriptive label`,
            color: '#0f0f0f',
            yAxisIndex: index % 2,
            label: { show: true },
        }));
        const chart = mockSavedChartResponse({
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: { layout: {}, eChartsConfig: { series } },
            },
        });
        expect(JSON.stringify(chart.chartConfig).length).toBeGreaterThan(3000);
        renderSync('?editChart=chart-uuid', chart);

        await user.click(screen.getByRole('button', { name: 'Edit' }));

        expect(chartVersionFromUrl().chartConfig).toEqual({
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        });
        expect(chartVersionFromUrl().metricQuery.limit).toBe(25);
    });

    it('writes nothing while the session is clean', () => {
        renderSync();

        expect(screen.getByTestId('search')).toHaveTextContent('');
        expect(chartVersionFromUrl()).toBeNull();
    });

    it('does not navigate when the desired version is unchanged', async () => {
        const user = userEvent.setup();
        renderSync();
        const keyWhileClean = screen.getByTestId('location-key').textContent;

        // A dispatch that leaves a clean session clean must not navigate.
        await user.click(screen.getByRole('button', { name: 'Revert' }));
        expect(screen.getByTestId('location-key').textContent).toBe(
            keyWhileClean,
        );

        // Nor one that re-applies an edit the url already carries.
        await user.click(screen.getByRole('button', { name: 'Edit' }));
        const keyWhileDirty = screen.getByTestId('location-key').textContent;
        expect(keyWhileDirty).not.toBe(keyWhileClean);

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByTestId('location-key').textContent).toBe(
            keyWhileDirty,
        );
    });

    it('carries an edit in the url and drops it when reverted', async () => {
        const user = userEvent.setup();
        renderSync();

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        expect(chartVersionFromUrl()).toMatchObject({
            tableName: 'payments',
            metricQuery: { limit: 25 },
        });

        await user.click(screen.getByRole('button', { name: 'Revert' }));
        expect(chartVersionFromUrl()).toBeNull();
    });

    it("leaves the dashboard's own params alone", async () => {
        const user = userEvent.setup();
        renderSync('?editChart=chart-uuid&tab=tab-uuid');

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        const params = new URLSearchParams(
            screen.getByTestId('search').textContent ?? '',
        );
        expect(params.get('editChart')).toBe('chart-uuid');
        expect(params.get('tab')).toBe('tab-uuid');
        expect(chartVersionFromUrl()).toMatchObject({
            metricQuery: { limit: 25 },
        });

        await user.click(screen.getByRole('button', { name: 'Revert' }));
        const remaining = new URLSearchParams(
            screen.getByTestId('search').textContent ?? '',
        );
        expect(remaining.get('editChart')).toBe('chart-uuid');
        expect(remaining.get('tab')).toBe('tab-uuid');
        expect(
            remaining.get(CREATE_SAVED_CHART_VERSION_SEARCH_PARAM),
        ).toBeNull();
    });
});
