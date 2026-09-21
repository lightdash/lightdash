import {
    DimensionType,
    FieldType,
    FilterOperator,
    getDashboardFiltersForTile,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    type CompiledDimension,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { resolveDashboardDateFilters } from './dashboardDateFilters';

const dateDimension = (
    table: string,
    name: string,
    timeInterval: TimeFrames,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
    hidden: false,
    timeInterval,
});

const createExplore = (
    table: string,
    dimensions: CompiledDimension[],
): Explore => ({
    name: table,
    label: table,
    tags: [],
    baseTable: table,
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        [table]: {
            name: table,
            label: table,
            database: 'test',
            schema: 'public',
            sqlTable: table,
            dimensions: Object.fromEntries(
                dimensions.map((dimension) => [dimension.name, dimension]),
            ),
            metrics: {},
            lineageGraph: {},
        },
    },
});

const sourceTarget = { fieldId: 'orders_month', tableName: 'orders' };
const target = { fieldId: 'orders_day', tableName: 'orders' };
const monthFilter: DashboardFilterRule = {
    id: 'month-filter',
    label: 'Order month',
    target: sourceTarget,
    operator: FilterOperator.EQUALS,
    values: ['2026-03-01'],
    tileTargets: { tile: target },
};
const dashboardFilters = (
    ...dimensions: DashboardFilterRule[]
): DashboardFilters => ({ dimensions, metrics: [], tableCalculations: [] });
const explore = createExplore('orders', [
    dateDimension('orders', 'month', TimeFrames.MONTH),
    dateDimension('orders', 'day', TimeFrames.DAY),
]);
const findExploreContainingTable =
    vi.fn<(table: string) => Promise<Explore | ExploreError | undefined>>();

const resolve = (filters: DashboardFilters, tileExplore = explore) =>
    resolveDashboardDateFilters({
        tileUuid: 'tile',
        dashboardFilters: filters,
        explore: tileExplore,
        findExploreContainingTable,
    });

describe('dashboard date filter periods', () => {
    beforeEach(() => {
        findExploreContainingTable.mockReset();
        findExploreContainingTable.mockResolvedValue(undefined);
    });

    it('retains a full month when applying an original dashboard rule to a day field', async () => {
        const filters = dashboardFilters(monthFilter);
        const originalFilters = structuredClone(filters);
        expect(await resolve(filters)).toEqual(
            dashboardFilters({
                ...monthFilter,
                target,
                settings: { sourceTarget, selectedPeriod: UnitOfTime.months },
            }),
        );
        expect(filters).toEqual(originalFilters);
        expect(findExploreContainingTable).not.toHaveBeenCalled();
    });

    it('retains the source month after the frontend has already remapped the rule', async () => {
        const filters = getDashboardFiltersForTile(
            'tile',
            dashboardFilters(monthFilter),
        );
        expect(await resolve(filters)).toEqual(
            dashboardFilters({
                ...monthFilter,
                target,
                settings: { sourceTarget, selectedPeriod: UnitOfTime.months },
            }),
        );
    });

    it.each([TimeFrames.MONTH, TimeFrames.QUARTER, TimeFrames.YEAR])(
        'preserves existing semantics for a %s target',
        async (interval) => {
            const filters = dashboardFilters(monthFilter);
            const tileExplore = createExplore('orders', [
                dateDimension('orders', 'month', TimeFrames.MONTH),
                dateDimension('orders', 'day', interval),
            ]);
            expect(await resolve(filters, tileExplore)).toEqual(
                getDashboardFiltersForTile('tile', filters),
            );
        },
    );

    it.each([FilterOperator.IN_THE_PAST, FilterOperator.IN_BETWEEN])(
        'preserves %s operators and their settings',
        async (operator) => {
            const filters = dashboardFilters({
                ...monthFilter,
                operator,
                settings: { unitOfTime: UnitOfTime.days },
                values:
                    operator === FilterOperator.IN_THE_PAST
                        ? [3]
                        : ['2026-03-01', '2026-04-01'],
            });
            expect(await resolve(filters)).toEqual(
                getDashboardFiltersForTile('tile', filters),
            );
            expect(findExploreContainingTable).not.toHaveBeenCalled();
        },
    );

    it('looks up a cross-explore source once for multiple filters', async () => {
        const tileExplore = createExplore('events', [
            dateDimension('events', 'day', TimeFrames.DAY),
        ]);
        const crossExploreFilter = {
            ...monthFilter,
            tileTargets: {
                tile: { fieldId: 'events_day', tableName: 'events' },
            },
        };
        findExploreContainingTable.mockResolvedValue(explore);
        const result = await resolve(
            dashboardFilters(crossExploreFilter, {
                ...crossExploreFilter,
                id: 'second-month-filter',
                values: ['2026-04-01'],
            }),
            tileExplore,
        );
        expect(result.dimensions.map((filter) => filter.settings)).toEqual([
            { sourceTarget, selectedPeriod: UnitOfTime.months },
            { sourceTarget, selectedPeriod: UnitOfTime.months },
        ]);
        expect(findExploreContainingTable).toHaveBeenCalledExactlyOnceWith(
            'orders',
        );
    });

    it.each<Explore | ExploreError | undefined>([
        undefined,
        { name: 'orders', label: 'Orders', errors: [] },
        createExplore('orders', []),
    ])(
        'preserves the rule when source metadata is unavailable (%j)',
        async (source) => {
            findExploreContainingTable.mockResolvedValue(source);
            const filters = dashboardFilters(monthFilter);
            expect(await resolve(filters, createExplore('events', []))).toEqual(
                getDashboardFiltersForTile('tile', filters),
            );
        },
    );

    it('preserves the mapped rule when destination metadata is missing', async () => {
        const filters = dashboardFilters({
            ...monthFilter,
            tileTargets: {
                tile: { fieldId: 'removed_day', tableName: 'removed' },
            },
        });

        expect(await resolve(filters)).toEqual(
            getDashboardFiltersForTile('tile', filters),
        );
        expect(findExploreContainingTable).toHaveBeenCalledExactlyOnceWith(
            'removed',
        );
    });

    it('preserves a coarser target found only in a secondary merge explore', async () => {
        const primaryExplore = createExplore('orders', [
            dateDimension('orders', 'week', TimeFrames.WEEK),
        ]);
        const secondaryExplore = createExplore('events', [
            dateDimension('events', 'month', TimeFrames.MONTH),
        ]);
        const filters = dashboardFilters({
            ...monthFilter,
            target: { fieldId: 'orders_week', tableName: 'orders' },
            values: ['2026-06-29'],
            tileTargets: {
                tile: { fieldId: 'events_month', tableName: 'events' },
            },
        });
        findExploreContainingTable.mockResolvedValue(secondaryExplore);

        expect(await resolve(filters, primaryExplore)).toEqual(
            getDashboardFiltersForTile('tile', filters),
        );
        expect(findExploreContainingTable).toHaveBeenCalledExactlyOnceWith(
            'events',
        );
    });

    it('applies the month period to an explicit SQL column target', async () => {
        const sqlTarget = {
            fieldId: 'order_date',
            tableName: '',
            isSqlColumn: true,
        };
        const filter = { ...monthFilter, tileTargets: { tile: sqlTarget } };
        findExploreContainingTable.mockResolvedValue(explore);
        const result = await resolveDashboardDateFilters({
            tileUuid: 'tile',
            dashboardFilters: dashboardFilters(filter),
            findExploreContainingTable,
        });
        expect(result.dimensions).toEqual([
            {
                ...filter,
                target: sqlTarget,
                settings: { sourceTarget, selectedPeriod: UnitOfTime.months },
            },
        ]);
    });

    it('preserves SQL source rules without inferring a period', async () => {
        const filters = dashboardFilters({
            ...monthFilter,
            target: { ...sourceTarget, isSqlColumn: true },
        });
        expect(await resolve(filters)).toEqual(
            getDashboardFiltersForTile('tile', filters),
        );
        expect(findExploreContainingTable).not.toHaveBeenCalled();
    });

    it('preserves multiple excluded months and unrelated settings', async () => {
        const filter = {
            ...monthFilter,
            operator: FilterOperator.NOT_EQUALS,
            values: ['2026-03-01', '2026-04-01'],
            settings: { completed: true },
        };
        expect(await resolve(dashboardFilters(filter))).toEqual(
            dashboardFilters({
                ...filter,
                target,
                settings: {
                    sourceTarget,
                    completed: true,
                    selectedPeriod: UnitOfTime.months,
                },
            }),
        );
    });
});
