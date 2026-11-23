import { TimeFrames } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { withOneGrainPerDate, type ChangedField } from './useModelFieldChanges';

const field = (
    name: string,
    date: ChangedField['date'],
    isMetric = false,
): ChangedField => ({
    key: `orders.${name}`,
    label: name,
    kind: 'new',
    attributes: [],
    fieldId: `orders_${name}`,
    isMetric,
    date,
});

describe('withOneGrainPerDate', () => {
    it('keeps a date at month and drops its other grains, raw and base', () => {
        const fields = [
            field('created', { base: 'created', grain: null }),
            field('created_raw', { base: 'created', grain: TimeFrames.RAW }),
            field('created_day', { base: 'created', grain: TimeFrames.DAY }),
            field('created_month', {
                base: 'created',
                grain: TimeFrames.MONTH,
            }),
            field('status', null),
            field('revenue', null, true),
        ];
        expect(withOneGrainPerDate(fields).map(({ key }) => key)).toEqual([
            'orders.created_month',
            'orders.status',
            'orders.revenue',
        ]);
    });

    it('falls back to a grain, then the base, when a date has no month', () => {
        expect(
            withOneGrainPerDate([
                field('shipped', { base: 'shipped', grain: null }),
                field('shipped_day', {
                    base: 'shipped',
                    grain: TimeFrames.DAY,
                }),
                field('paid', { base: 'paid', grain: null }),
            ]).map(({ key }) => key),
        ).toEqual(['orders.shipped_day', 'orders.paid']);
    });
});
