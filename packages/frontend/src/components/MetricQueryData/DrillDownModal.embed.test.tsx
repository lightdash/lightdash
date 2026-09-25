import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbedProviderContext from '../../ee/providers/Embed/context';
import { type EmbedContext } from '../../ee/providers/Embed/types';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import { DrillDownModal } from './DrillDownModal';

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
}));

const field = {
    table: 'orders',
    tableLabel: 'Orders',
    tablesReferences: ['orders'],
    hidden: false,
};
const status: CompiledDimension = {
    ...field,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    sql: '${TABLE}.status',
    compiledSql: '"orders".status',
};
const count: CompiledMetric = {
    ...field,
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name: 'count',
    label: 'Count',
    sql: '${TABLE}.id',
    compiledSql: 'COUNT("orders".id)',
};
const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    spotlight: { visibility: 'show', categories: [] },
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: { status },
            metrics: { count },
            lineageGraph: {},
        },
    },
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
    underlyingDataConfig: undefined,
    isUnderlyingDataModalOpen: false,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: {
        item: count,
        fieldValues: { orders_count: { raw: 12, formatted: '12' } },
    },
    isDrillDownModalOpen: true,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};
const outsideEmbed: EmbedContext = {
    t: () => undefined,
    mode: 'direct',
    theme: 'light',
    backgroundColor: null,
    timezone: null,
};

const renderModal = (embed: EmbedContext) =>
    renderWithProviders(
        <EmbedProviderContext.Provider value={embed}>
            <Context.Provider value={metricQueryData}>
                <DrillDownModal />
            </Context.Provider>
        </EmbedProviderContext.Provider>,
    );

describe('drill-down modal in an embed', () => {
    afterEach(() => vi.restoreAllMocks());

    it('drills in place through the embed explore handler', async () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        const user = userEvent.setup();
        const onExplore = vi.fn();
        renderModal({ ...outsideEmbed, embedToken: 'token', onExplore });

        expect(screen.queryByText('Open in new tab')).not.toBeInTheDocument();
        await user.click(screen.getByPlaceholderText('Search field...'));
        await user.click(await screen.findByRole('option', { name: 'Status' }));
        await user.click(screen.getByRole('button', { name: 'Drill down' }));

        expect(onExplore).toHaveBeenCalledWith({
            chart: expect.objectContaining({
                tableName: 'orders',
                metricQuery: expect.objectContaining({
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
                }),
            }),
        });
    });

    it('keeps the new-tab link outside an embed', () => {
        renderModal(outsideEmbed);

        expect(screen.getByText('Open in new tab')).toBeInTheDocument();
        expect(screen.queryByText('Drill down')).not.toBeInTheDocument();
    });
});
