import {
    CartesianSeriesType,
    ChartType,
    FilterOperator,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import DocumentChartExploreButton from './DocumentChartExploreButton';

const mocks = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => mocks.navigate,
}));

const chart: CreateSavedChartVersion = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {
            dimensions: {
                id: 'group',
                and: [
                    {
                        id: 'status',
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['complete'],
                    },
                ],
            },
        },
        sorts: [{ fieldId: 'orders_count', descending: true }],
        limit: 50,
        tableCalculations: [],
        timezone: 'Europe/London',
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_status', yField: ['orders_count'] },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        name: 'Orders'.repeat(1000),
                        encode: {
                            xRef: { field: 'orders_status' },
                            yRef: { field: 'orders_count' },
                        },
                    },
                ],
            },
        },
    },
    pivotConfig: { columns: ['orders_status'], rows: ['orders_count'] },
    tableConfig: { columnOrder: ['orders_count', 'orders_status'] },
    parameters: { currency: 'GBP' },
};

describe('Document chart exploration', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        mocks.api.mockReset();
        mocks.navigate.mockReset();
        sessionStorage.clear();
        window.history.replaceState(
            {},
            '',
            '/projects/project/documents/report',
        );
    });
    afterEach(() => clients.forEach((client) => client.clear()));
    const renderButton = () => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
        });
        clients.push(client);
        return render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <DocumentChartExploreButton
                        projectUuid="project"
                        chart={chart}
                    />
                </MantineProvider>
            </QueryClientProvider>,
        );
    };

    it('opens an unsaved Explore with the complete query and visualization through the existing share API', async () => {
        mocks.api.mockResolvedValue({ nanoid: 'explore-link' });
        sessionStorage.setItem('fromDashboard', 'Old dashboard');
        sessionStorage.setItem('dashboardUuid', 'dashboard');
        const before = structuredClone(chart);
        renderButton();
        fireEvent.click(
            screen.getByRole('button', { name: 'Explore from here' }),
        );
        await waitFor(() =>
            expect(mocks.navigate).toHaveBeenCalledWith('/share/explore-link'),
        );
        expect(mocks.api).toHaveBeenCalledTimes(1);
        const request = mocks.api.mock.calls[0][0];
        expect(request).toMatchObject({ url: '/share/', method: 'POST' });
        const payload = JSON.parse(request.body);
        expect(payload.path).toBe('/projects/project/tables/orders');
        const params = new URLSearchParams(payload.params);
        expect(params.get('isExploreFromHere')).toBe('true');
        expect(
            JSON.parse(params.get('create_saved_chart_version') ?? ''),
        ).toEqual(chart);
        expect(chart).toEqual(before);
        expect(sessionStorage.getItem('fromDashboard')).toBeNull();
        expect(sessionStorage.getItem('dashboardUuid')).toBeNull();
    });

    it('prevents duplicate requests and waits for the share link before navigating', async () => {
        let resolveShare: (value: { nanoid: string }) => void = () => {};
        mocks.api.mockReturnValue(
            new Promise((resolve) => {
                resolveShare = resolve;
            }),
        );
        renderButton();
        const button = screen.getByRole('button', {
            name: 'Explore from here',
        });
        fireEvent.click(button);
        await waitFor(() => expect(button).toBeDisabled());
        fireEvent.click(button);
        expect(mocks.api).toHaveBeenCalledTimes(1);
        expect(mocks.navigate).not.toHaveBeenCalled();
        resolveShare({ nanoid: 'ready' });
        await waitFor(() =>
            expect(mocks.navigate).toHaveBeenCalledWith('/share/ready'),
        );
    });

    it('keeps the reader on the document after a failure and allows retrying', async () => {
        mocks.api.mockRejectedValueOnce({
            error: { message: 'Could not create link' },
        });
        mocks.api.mockResolvedValueOnce({ nanoid: 'retry' });
        sessionStorage.setItem('fromDashboard', 'Old dashboard');
        renderButton();
        fireEvent.click(
            screen.getByRole('button', { name: 'Explore from here' }),
        );
        expect(
            await screen.findByText('Could not create link'),
        ).toBeInTheDocument();
        expect(mocks.navigate).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('fromDashboard')).toBe('Old dashboard');
        fireEvent.click(
            screen.getByRole('button', { name: 'Explore from here' }),
        );
        await waitFor(() =>
            expect(mocks.navigate).toHaveBeenCalledWith('/share/retry'),
        );
    });
});
