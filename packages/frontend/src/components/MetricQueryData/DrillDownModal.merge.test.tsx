import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type Filters,
    type MergeFieldOrigins,
    type MetricQuery,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import DrillDownMenuItem from './DrillDownMenuItem';
import { DrillDownModal } from './DrillDownModal';

const { showToastError } = vi.hoisted(() => ({ showToastError: vi.fn() }));

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: explore }),
    useExploreQueries: () => sourceExplores,
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));
vi.mock('../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => merge,
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError, showToastSuccess: vi.fn() }),
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
const sourceExplores = [explore, explore];
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
let merge: {
    additionalSources: Array<{
        id: string;
        exploreName: string;
        dimensions: string[];
        metrics: string[];
        filters: Filters;
    }>;
    mergeResults: { fieldOrigins: MergeFieldOrigins };
} = {
    additionalSources: [
        {
            id: 'b',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_count'],
            filters: {},
        },
    ],
    mergeResults: {
        fieldOrigins: {
            merge_orders_status: {
                kind: 'joinKey',
                fieldIdBySourceId: { a: 'orders_status', b: 'orders_status' },
            },
            orders_2_orders_count: {
                kind: 'source',
                sourceId: 'b',
                sourceFieldId: 'orders_count',
            },
        },
    },
};
// The chart surfaces pass the merged column, not the source field
const mergedCount: CompiledMetric = { ...count, table: 'orders_2_orders' };
const metricQueryData: MetricQueryDataContext = {
    tableName: 'orders',
    explore,
    metricQuery,
    underlyingDataConfig: undefined,
    isUnderlyingDataModalOpen: false,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: {
        item: mergedCount,
        fieldValues: {
            merge_orders_status: { raw: 'completed', formatted: 'completed' },
            orders_2_orders_count: { raw: 3, formatted: '3' },
        },
    },
    isDrillDownModalOpen: true,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};

const drillByStatus = async (context: MetricQueryDataContext) => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    const user = userEvent.setup();
    renderWithProviders(
        <Context.Provider value={context}>
            <DrillDownModal />
        </Context.Provider>,
    );

    expect(screen.getByText('Drill into "3"')).toBeInTheDocument();
    await user.click(screen.getByPlaceholderText('Search field...'));
    await user.click(await screen.findByRole('option', { name: 'Status' }));

    const href = screen
        .getByText('Open in new tab')
        .closest('a')
        ?.getAttribute('href');
    return new URL(href ?? '', 'http://localhost').searchParams;
};
const drilledChart = (params: URLSearchParams) =>
    JSON.parse(params.get('create_saved_chart_version') ?? '{}');

describe('drill-down modal on a merged result', () => {
    const mergeWithKeySelected = merge;
    afterEach(() => {
        vi.restoreAllMocks();
        showToastError.mockReset();
        merge = mergeWithKeySelected;
        window.history.replaceState(null, '', '/');
    });

    it('drills into the source that owns the clicked column', async () => {
        const chart = drilledChart(await drillByStatus(metricQueryData));
        expect(chart.metricQuery.metrics).toEqual(['orders_count']);
        expect(chart.metricQuery.filters.dimensions.and).toEqual([
            expect.objectContaining({
                target: { fieldId: 'orders_status' },
                values: ['completed'],
            }),
        ]);
    });

    it.each([
        ['a chart series', metricQueryData.drillDownConfig],
        [
            'a results cell',
            {
                item: count,
                fieldValues: {
                    orders_status: { raw: 'completed', formatted: 'completed' },
                    orders_count: { raw: 3, formatted: '3' },
                },
                source: {
                    tableName: 'orders',
                    metricQuery: { ...metricQuery, dimensions: [] },
                },
            },
        ],
    ])(
        'keeps the join key filter the source does not select, from %s',
        async (_, drillDownConfig) => {
            merge = {
                ...merge,
                additionalSources: [
                    { ...merge.additionalSources[0], dimensions: [] },
                ],
            };

            const chart = drilledChart(
                await drillByStatus({ ...metricQueryData, drillDownConfig }),
            );
            expect(chart.metricQuery.filters.dimensions.and).toEqual([
                expect.objectContaining({
                    target: { fieldId: 'orders_status' },
                    values: ['completed'],
                }),
            ]);
        },
    );

    describe('a merged column no source owns', () => {
        const ratio: CompiledMetric = {
            ...count,
            table: 'merge',
            name: 'merge_ratio',
        };
        const ratioFieldValues = {
            merge_merge_ratio: { raw: 3, formatted: '3' },
        };
        const withRatio = () => {
            merge = {
                ...merge,
                mergeResults: {
                    fieldOrigins: {
                        ...merge.mergeResults.fieldOrigins,
                        merge_merge_ratio: { kind: 'tableCalculation' },
                    },
                },
            };
        };

        it('is never offered for drilling', () => {
            withRatio();
            renderWithProviders(
                <Context.Provider value={metricQueryData}>
                    <Menu opened>
                        <Menu.Target>
                            <button type="button">Cell</button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <DrillDownMenuItem
                                item={ratio}
                                fieldValues={ratioFieldValues}
                                trackingData={{
                                    organizationId: undefined,
                                    userId: undefined,
                                    projectId: undefined,
                                }}
                            />
                        </Menu.Dropdown>
                    </Menu>
                </Context.Provider>,
            );

            expect(screen.queryByText(/Drill into/)).not.toBeInTheDocument();
        });

        it('renders no drill modal and no toast', () => {
            withRatio();
            renderWithProviders(
                <StrictMode>
                    <Context.Provider
                        value={{
                            ...metricQueryData,
                            drillDownConfig: {
                                item: ratio,
                                fieldValues: ratioFieldValues,
                            },
                        }}
                    >
                        <DrillDownModal />
                    </Context.Provider>
                </StrictMode>,
            );

            expect(
                screen.queryByText('Open in new tab'),
            ).not.toBeInTheDocument();
            expect(showToastError).not.toHaveBeenCalled();
        });
    });

    it('does not carry the open merge into the drilled chart', async () => {
        window.history.replaceState(null, '', '/?merge=%7B%7D&fromSpace=s');

        const params = await drillByStatus(metricQueryData);
        expect(params.get('merge')).toBeNull();
        expect(params.get('fromSpace')).toBe('s');
    });
});
