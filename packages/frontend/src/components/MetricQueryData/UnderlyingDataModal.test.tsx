import {
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import UnderlyingDataModal from './UnderlyingDataModal';

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
}));
const mocks = vi.hoisted(() => ({
    resultsData: undefined as unknown,
    createShareUrl: vi.fn(),
}));
vi.mock('../../hooks/useUnderlyingDataResults', () => ({
    useUnderlyingDataResults: () => ({
        data: mocks.resultsData,
        error: null,
        isInitialLoading: false,
    }),
    getUnderlyingDataResults: vi.fn(),
}));
vi.mock('../../hooks/useShare', () => ({
    useCreateShareMutation: () => ({
        mutateAsync: mocks.createShareUrl,
        isLoading: false,
    }),
}));
vi.mock('../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => true,
}));
vi.mock('../../providers/Ability', () => ({
    Can: ({ children }: { children: React.ReactNode }) => children,
}));

const count: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    table: 'orders',
    tableLabel: 'Orders',
    tablesReferences: ['orders'],
    name: 'count',
    label: 'Count',
    sql: '${TABLE}.id',
    compiledSql: 'COUNT("orders".id)',
    hidden: false,
};
const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    spotlight: { visibility: 'show', categories: [] },
    tables: {},
};
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const metricQueryData: MetricQueryDataContext = {
    tableName: 'orders',
    explore,
    metricQuery,
    underlyingDataConfig: {
        item: count,
        value: { raw: 12, formatted: '12' },
        fieldValues: { orders_count: { raw: 12, formatted: '12' } },
    },
    isUnderlyingDataModalOpen: true,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: undefined,
    isDrillDownModalOpen: false,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};

describe('underlying data modal outside the explorer', () => {
    it('opens from a dashboard tile, with no merge or explorer state', async () => {
        renderWithProviders(
            <MemoryRouter>
                <Context.Provider value={metricQueryData}>
                    <UnderlyingDataModal />
                </Context.Provider>
            </MemoryRouter>,
        );

        expect(
            await screen.findByText(/View underlying data/),
        ).toBeInTheDocument();
    });

    it('explores from here with the parameter values the chart ran with', async () => {
        const parameters = { region: 'UK' };
        mocks.resultsData = {
            queryUuid: 'underlying-query',
            metricQuery: { ...metricQuery, dimensions: ['orders_status'] },
            fields: {},
            rows: [],
        };
        mocks.createShareUrl.mockResolvedValue({ nanoid: 'share' });
        renderWithProviders(
            <MemoryRouter>
                <Context.Provider value={{ ...metricQueryData, parameters }}>
                    <UnderlyingDataModal />
                </Context.Provider>
            </MemoryRouter>,
        );

        fireEvent.click(
            await screen.findByRole('button', { name: 'Explore from here' }),
        );

        await waitFor(() => {
            expect(mocks.createShareUrl).toHaveBeenCalledTimes(1);
        });
        const { params } = mocks.createShareUrl.mock.calls[0][0];
        const chart = JSON.parse(
            new URLSearchParams(params).get('create_saved_chart_version') ??
                '{}',
        );
        expect(chart.parameters).toEqual(parameters);
    });
});
