import {
    DimensionType,
    FieldType,
    getTotalFilterRules,
    type FilterableField,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import {
    addMergeSourceFilter,
    useMergeSourceFilter,
} from './useMergeSourceFilter';

vi.mock('uuid', () => ({ v4: () => 'filter-id' }));

const mocks = vi.hoisted(() => ({
    dispatch: vi.fn(),
    setSourceFilters: vi.fn(),
}));
vi.mock('../context/useMerge', () => ({
    useMerge: () => ({
        additionalSources: [{ id: 'b', filters: {} }],
        // The second source's key field is filled in by default
        joinParts: [{ fieldIdBySourceId: { a: 'orders_customer_id' } }],
        setSourceFilters: mocks.setSourceFilters,
        setFocus: vi.fn(),
    }),
}));
vi.mock('../../explorer/store', () => ({
    explorerActions: {
        setFilters: (payload: unknown) => ({ type: 'setFilters', payload }),
        toggleExpandedSection: () => ({ type: 'toggle' }),
    },
    selectFilters: () => ({}),
    selectIsFiltersExpanded: () => true,
    useExplorerDispatch: () => mocks.dispatch,
    useExplorerStore: () => ({ getState: () => ({}) }),
}));

const field = (table: string, name: string) =>
    ({
        table,
        tableLabel: table,
        name,
        label: name,
        type: DimensionType.STRING,
        fieldType: FieldType.DIMENSION,
        hidden: false,
    }) as FilterableField;

const fieldIds = (filters: ReturnType<typeof addMergeSourceFilter>[string]) =>
    getTotalFilterRules(filters).flatMap((rule) =>
        'fieldId' in rule.target ? [rule.target.fieldId] : [],
    );

describe('addMergeSourceFilter', () => {
    it('adds an ordinary field filter only to its source', () => {
        const result = addMergeSourceFilter({
            sourceId: 'b',
            field: field('subscriptions', 'status'),
            filtersBySourceId: { a: {}, b: {} },
            joinParts: [],
        });

        expect(fieldIds(result.a)).toEqual([]);
        expect(fieldIds(result.b)).toEqual(['subscriptions_status']);
    });

    it('mirrors a matching-field filter to the other source', () => {
        const result = addMergeSourceFilter({
            sourceId: 'b',
            field: field('subscriptions', 'customer_id'),
            filtersBySourceId: { a: {}, b: {} },
            joinParts: [
                {
                    fieldIdBySourceId: {
                        a: 'orders_customer_id',
                        b: 'subscriptions_customer_id',
                    },
                },
            ],
        });

        expect(fieldIds(result.a)).toEqual(['orders_customer_id']);
        expect(fieldIds(result.b)).toEqual(['subscriptions_customer_id']);
    });
});

describe('useMergeSourceFilter', () => {
    // As on main: the filter is shared over chosen join fields only
    it('keeps a join-field filter on its own source while the key is a default', () => {
        window.scrollTo = vi.fn();
        const { result } = renderHook(() => useMergeSourceFilter());

        result.current('b', field('subscriptions', 'customer_id'));

        expect(mocks.dispatch).not.toHaveBeenCalled();
        expect(fieldIds(mocks.setSourceFilters.mock.calls[0][1])).toEqual([
            'subscriptions_customer_id',
        ]);
    });
});
