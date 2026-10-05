import {
    applyMetricOverrides,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from './filter';

describe('applyMetricOverrides', () => {
    const createMetricFilter = (
        id: string,
        fieldId: string,
        values: string[] = ['value1'],
    ): DashboardFilterRule => ({
        id,
        label: `Label for ${fieldId}`,
        operator: FilterOperator.EQUALS,
        target: {
            fieldId,
            tableName: 'orders',
        },
        tileTargets: {},
        disabled: false,
        values,
    });

    const createDashboardFilters = (
        metrics: DashboardFilterRule[],
    ): DashboardFilters => ({
        dimensions: [],
        metrics,
        tableCalculations: [],
    });

    it('keeps the saved additional targets when the override has none or stale ones', () => {
        const savedAdditionalTargets = [
            { fieldId: 'payments_total', tableName: 'payments' },
        ];
        const savedFilters = createDashboardFilters([
            {
                ...createMetricFilter('metric-1', 'orders_total'),
                additionalTargets: savedAdditionalTargets,
            },
            createMetricFilter('metric-2', 'orders_count'),
        ]);

        const result = applyMetricOverrides(savedFilters, [
            createMetricFilter('metric-1', 'orders_total', ['999']),
            {
                ...createMetricFilter('metric-2', 'orders_count', ['5']),
                additionalTargets: savedAdditionalTargets,
            },
        ]);

        expect(result[0].values).toEqual(['999']);
        expect(result[0].additionalTargets).toEqual(savedAdditionalTargets);
        expect(result[1].values).toEqual(['5']);
        expect(result[1].additionalTargets).toBeUndefined();
    });

    it('applies override values while keeping saved-dashboard-owned fields', () => {
        const savedTileTargets = {
            'tile-1': { fieldId: 'orders_total', tableName: 'orders' },
        };
        const savedFilters = createDashboardFilters([
            {
                ...createMetricFilter('metric-1', 'orders_total'),
                tileTargets: savedTileTargets,
                required: true,
                lockedTabUuids: ['tab-1'],
            },
            {
                ...createMetricFilter('metric-2', 'orders_count'),
                requiredGroupId: 'group-1',
            },
        ]);
        const overrides = [
            createMetricFilter('metric-1', 'orders_total', ['999']),
        ];

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result).toHaveLength(2);
        expect(result[0].values).toEqual(['999']);
        expect(result[0].tileTargets).toEqual(savedTileTargets);
        expect(result[0].required).toBe(true);
        expect(result[0].lockedTabUuids).toEqual(['tab-1']);
        expect(result[1]).toEqual(savedFilters.metrics[1]);
    });

    it('ignores requirement flags supplied by the override', () => {
        const savedFilters = createDashboardFilters([
            createMetricFilter('metric-1', 'orders_total'),
        ]);
        const overrides = [
            {
                ...createMetricFilter('metric-1', 'orders_total', ['999']),
                required: true,
                requiredGroupId: 'injected-group',
            },
        ];

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result).toHaveLength(1);
        expect(result[0].required).toBeUndefined();
        expect(result[0].requiredGroupId).toBeUndefined();
    });

    it('accepts DashboardFilters as overrides and never appends unmatched rules', () => {
        const savedFilters = createDashboardFilters([
            {
                ...createMetricFilter('metric-1', 'orders_total'),
                requiredGroupId: 'group-1',
            },
        ]);
        const overrides = createDashboardFilters([
            createMetricFilter('metric-1', 'orders_total', ['999']),
            createMetricFilter('unmatched', 'orders_count'),
        ]);

        const result = applyMetricOverrides(savedFilters, overrides);

        expect(result).toHaveLength(1);
        expect(result[0].values).toEqual(['999']);
        expect(result[0].requiredGroupId).toBe('group-1');
    });
});
