import {
    DimensionType,
    FieldType,
    getTotalFilterRules,
    type FilterableField,
} from '@lightdash/common';
import { addMergeSourceFilter } from './useMergeSourceFilter';

vi.mock('uuid', () => ({ v4: () => 'filter-id' }));

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
