import { FilterOperator, type Explore } from '@lightdash/common';
import { mockOrdersExplore } from '../../utils/validationExplore.mock';
import { hydrateDiscoverFieldsSelection } from './hydrateResult';

const makeGetExplore =
    (explore: Explore) =>
    async ({ table }: { table: string }) => {
        expect(table).toBe(explore.name);
        return explore;
    };

const exploreWithRequiredFilters: Explore = {
    ...mockOrdersExplore,
    tables: {
        ...mockOrdersExplore.tables,
        orders: {
            ...mockOrdersExplore.tables.orders,
            requiredFilters: [
                {
                    id: 'required-filter-1',
                    target: { fieldRef: 'orders.order_date' },
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                    required: true,
                },
            ],
        },
    },
};

describe('hydrateDiscoverFieldsSelection', () => {
    it('hydrates resolved field IDs from explore metadata', async () => {
        const result = await hydrateDiscoverFieldsSelection({
            selection: {
                status: 'resolved',
                exploreName: exploreWithRequiredFilters.name,
                dimensionIds: ['orders_order_date'],
                metricIds: ['orders_total_revenue'],
                rationale: 'Revenue over time',
            },
            availableExplores: [exploreWithRequiredFilters],
            getExplore: makeGetExplore(exploreWithRequiredFilters),
            toolDescriptionMaxChars: 600,
        });

        if (result.status !== 'success') {
            throw new Error(result.error);
        }
        if (result.discovery.status !== 'resolved') {
            throw new Error('Expected resolved discovery');
        }

        expect(result.discovery.explore).toMatchObject({
            name: 'test_explore',
            label: 'Test Explore',
            baseTable: 'orders',
            joinedTables: [],
            requiredFilters: [
                {
                    fieldId: 'orders_order_date',
                    fieldRef: 'orders.order_date',
                    tableName: 'orders',
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                    required: true,
                },
            ],
        });
        expect(result.discovery.fields).toEqual([
            expect.objectContaining({
                fieldId: 'orders_order_date',
                name: 'order_date',
                label: 'Order Date',
                table: 'orders',
                fieldType: 'dimension',
                fieldValueType: 'date',
                fieldFilterType: 'date',
                caseSensitiveFilters: 'not_applicable',
                isFromJoinedTable: false,
            }),
            expect.objectContaining({
                fieldId: 'orders_total_revenue',
                name: 'total_revenue',
                label: 'Total Revenue',
                table: 'orders',
                fieldType: 'metric',
                fieldValueType: 'sum',
                fieldFilterType: 'number',
                caseSensitiveFilters: 'not_applicable',
                isFromJoinedTable: false,
            }),
        ]);
    });

    it('rejects resolved output with no selected fields', async () => {
        const result = await hydrateDiscoverFieldsSelection({
            selection: {
                status: 'resolved',
                exploreName: mockOrdersExplore.name,
                dimensionIds: [],
                metricIds: [],
                rationale: null,
            },
            availableExplores: [mockOrdersExplore],
            getExplore: makeGetExplore(mockOrdersExplore),
            toolDescriptionMaxChars: 600,
        });

        expect(result).toEqual({
            status: 'error',
            error: 'Resolved discovery must select at least one dimension or metric ID.',
        });
    });

    it('rejects metric IDs submitted as dimensions', async () => {
        const result = await hydrateDiscoverFieldsSelection({
            selection: {
                status: 'resolved',
                exploreName: mockOrdersExplore.name,
                dimensionIds: ['orders_total_revenue'],
                metricIds: [],
                rationale: null,
            },
            availableExplores: [mockOrdersExplore],
            getExplore: makeGetExplore(mockOrdersExplore),
            toolDescriptionMaxChars: 600,
        });

        expect(result).toEqual({
            status: 'error',
            error: 'Expected dimension IDs but received metric IDs: orders_total_revenue',
        });
    });

    it('rejects missing field IDs', async () => {
        const result = await hydrateDiscoverFieldsSelection({
            selection: {
                status: 'resolved',
                exploreName: mockOrdersExplore.name,
                dimensionIds: ['orders_missing_dimension'],
                metricIds: [],
                rationale: null,
            },
            availableExplores: [mockOrdersExplore],
            getExplore: makeGetExplore(mockOrdersExplore),
            toolDescriptionMaxChars: 600,
        });

        expect(result).toEqual({
            status: 'error',
            error: 'Selected dimension IDs do not exist or are hidden in explore "test_explore": orders_missing_dimension',
        });
    });
});
