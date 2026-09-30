import { FilterOperator, type DashboardFilters } from '../..';
import { serializeDashboardFiltersForAiContext } from './dashboardContext';

const filter = {
    id: 'filter-uuid',
    label: 'Country',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders.country', tableName: 'orders' },
    values: ['US'],
    tileTargets: {
        'tile-uuid': { fieldId: 'orders.country', tableName: 'orders' },
    },
    lockedTabUuids: ['tab-uuid'],
    requiredGroupId: 'group-uuid',
    boundaries: { type: 'string' as const, values: ['US', 'CA'] },
};

describe('serializeDashboardFiltersForAiContext', () => {
    it('removes opaque identifiers and author-owned boundaries from every filter group', () => {
        const filters: DashboardFilters = {
            dimensions: [filter],
            metrics: [filter],
            tableCalculations: [filter],
        };

        expect(serializeDashboardFiltersForAiContext(filters)).toEqual({
            dimensions: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
            metrics: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
            tableCalculations: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
        });
    });
});
