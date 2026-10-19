import {
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
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
vi.mock('../../hooks/useUnderlyingDataResults', () => ({
    useUnderlyingDataResults: () => ({
        data: undefined,
        error: null,
        isInitialLoading: false,
    }),
    getUnderlyingDataResults: vi.fn(),
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
});
