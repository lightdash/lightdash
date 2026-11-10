import { type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { diffDraftFields } from './draftState';

const explore = (
    dimensions: Record<string, { sql: string; index: number }>,
    metrics: Record<string, { sql: string; index: number }> = {},
): Explore => {
    const items = (fieldType: string, fields: typeof dimensions) =>
        Object.fromEntries(
            Object.entries(fields).map(([name, field]) => [
                name,
                { name, table: 'orders', fieldType, ...field },
            ]),
        );
    const tables = {
        orders: {
            dimensions: items('dimension', dimensions),
            metrics: items('metric', metrics),
        },
    };
    return JSON.parse(JSON.stringify({ tables }));
};

describe('diffDraftFields', () => {
    const live = explore(
        {
            amount: { sql: 'amount', index: 0 },
            status: { sql: 'status', index: 1 },
        },
        { revenue: { sql: 'amount', index: 0 } },
    );

    it('finds nothing when the draft leaves the fields alone', () => {
        expect(diffDraftFields(live, live).size).toBe(0);
    });

    it('tags new, changed and removed fields', () => {
        const draft = explore(
            { status: { sql: 'lower(status)', index: 0 } },
            {
                revenue: { sql: 'amount', index: 0 },
                orders: { sql: 'id', index: 1 },
            },
        );
        expect(Object.fromEntries(diffDraftFields(live, draft))).toEqual({
            orders_amount: 'removed',
            orders_status: 'changed',
            orders_orders: 'new',
        });
    });

    it('ignores a field that only moved', () => {
        const draft = explore(
            { status: { sql: 'status', index: 0 } },
            { revenue: { sql: 'amount', index: 0 } },
        );
        expect(Object.fromEntries(diffDraftFields(live, draft))).toEqual({
            orders_amount: 'removed',
        });
    });

    it('removes every field when the model goes', () => {
        expect([...diffDraftFields(live, null).values()]).toEqual([
            'removed',
            'removed',
            'removed',
        ]);
    });
});
