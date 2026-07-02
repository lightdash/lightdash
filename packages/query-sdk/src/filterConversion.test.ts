import { describe, expect, it } from 'vitest';
import { toInternalFilters } from './filterConversion';

describe('toInternalFilters', () => {
    it('converts field/operator/value and wraps scalar values', () => {
        expect(
            toInternalFilters([
                { field: 'orders_status', operator: 'equals', value: 'done' },
            ]),
        ).toEqual([
            {
                fieldId: 'orders_status',
                operator: 'equals',
                values: ['done'],
                settings: null,
            },
        ]);
    });

    it('spreads array values into the values list', () => {
        const [f] = toInternalFilters([
            {
                field: 'orders_status',
                operator: 'include',
                value: ['done', 'shipped'],
            },
        ]);
        expect(f.values).toEqual(['done', 'shipped']);
    });

    it('carries relative-date settings for unit filters', () => {
        const [f] = toInternalFilters([
            {
                field: 'orders_date',
                operator: 'inThePast',
                value: 30,
                unit: 'days',
                completed: true,
            },
        ]);
        expect(f.values).toEqual([30]);
        expect(f.settings).toEqual({ unitOfTime: 'days', completed: true });
    });

    it('omits values for value-less operators', () => {
        expect(
            toInternalFilters([{ field: 'x', operator: 'isNull' }])[0].values,
        ).toEqual([]);
    });
});
