import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FieldSummary from './FieldSummary';
import { type Field } from './model';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

const dimension: Field = {
    id: 'customers_first_name',
    name: 'first_name',
    label: 'First name',
    fieldKind: 'dimension',
    type: 'string',
    table: 'customers',
    tableLabel: 'Customers',
    description: '',
    aiHint: '',
    group: '',
    inUse: true,
    definition: { label: 'SQL', value: '${TABLE}.first_name' },
    visibleTo: null,
    isInternal: false,
    isRequired: false,
    chartUsage: null,
    lastEdit: null,
    draftState: null,
};

const renderSummary = (field: Field, warehouseProjectUuid: string | null) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <MantineProvider>
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        </MantineProvider>
    );
    return {
        client,
        ...render(
            <FieldSummary
                field={field}
                warehouseProjectUuid={warehouseProjectUuid}
            />,
            { wrapper },
        ),
    };
};

describe('FieldSummary', () => {
    beforeEach(() => {
        api.mockReset();
    });

    it('shows usage for a warehouse dimension using its underlying joined table', async () => {
        api.mockResolvedValue({
            charts: [{ uuid: 'chart-a' }, { uuid: 'chart-b' }],
        });
        renderSummary(dimension, 'project');

        expect(await screen.findByText(/Used in 2 charts/)).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith({
            url: '/projects/project/dataCatalog/customers/analytics/first_name',
            method: 'GET',
            body: undefined,
        });
        expect(screen.getByText('${TABLE}.first_name')).toBeInTheDocument();
    });

    it('shows singular usage for a warehouse metric', async () => {
        api.mockResolvedValue({ charts: [{ uuid: 'chart-a' }] });
        renderSummary(
            { ...dimension, name: 'count', fieldKind: 'metric' },
            'project',
        );

        expect(await screen.findByText(/Used in 1 chart/)).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/dataCatalog/customers/analytics/count',
            }),
        );
    });

    it('reports an unused warehouse field only after a successful response', async () => {
        api.mockResolvedValue({ charts: [] });
        renderSummary(dimension, 'project');

        expect(
            await screen.findByText(/Not used in any chart/),
        ).toBeInTheDocument();
    });

    it('does not report a loading field as unused', () => {
        api.mockReturnValue(new Promise(() => {}));
        renderSummary(dimension, 'project');

        expect(
            screen.queryByText(/Used in|Not used in/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('${TABLE}.first_name')).toBeInTheDocument();
    });

    it('omits an unavailable count without hiding the field definition', async () => {
        api.mockRejectedValue({
            error: { statusCode: 403, message: 'Forbidden' },
        });
        const { client } = renderSummary(dimension, 'project');

        await waitFor(() =>
            expect(
                client.getQueryState([
                    'metric-chart-analytics',
                    'project',
                    'customers',
                    'first_name',
                ])?.status,
            ).toBe('error'),
        );
        expect(
            screen.queryByText(/Used in|Not used in/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('${TABLE}.first_name')).toBeInTheDocument();
    });

    it.each([null, 0, 1, 2])(
        'preserves a non-warehouse usage count of %s without fetching',
        (chartUsage) => {
            renderSummary({ ...dimension, chartUsage }, null);

            expect(api).not.toHaveBeenCalled();
            if (chartUsage === null) {
                expect(
                    screen.queryByText(/Used in|Not used in/),
                ).not.toBeInTheDocument();
            } else {
                expect(
                    screen.getByText(
                        new RegExp(
                            chartUsage === 0
                                ? 'Not used in any chart'
                                : `Used in ${chartUsage} chart${chartUsage === 1 ? '' : 's'}`,
                        ),
                    ),
                ).toBeInTheDocument();
            }
        },
    );

    it('does not show the previous field count while a different field loads', async () => {
        api.mockResolvedValueOnce({ charts: [{ uuid: 'chart-a' }] });
        const { rerender } = renderSummary(dimension, 'project');
        expect(await screen.findByText(/Used in 1 chart/)).toBeInTheDocument();

        api.mockReturnValue(new Promise(() => {}));
        rerender(
            <FieldSummary
                field={{ ...dimension, name: 'last_name' }}
                warehouseProjectUuid="project"
            />,
        );

        expect(
            screen.queryByText(/Used in|Not used in/),
        ).not.toBeInTheDocument();
        expect(api).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: '/projects/project/dataCatalog/customers/analytics/last_name',
            }),
        );
    });
});
