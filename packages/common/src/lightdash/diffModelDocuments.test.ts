import { describe, expect, it } from 'vitest';
import {
    diffModelDocuments,
    doModelPathsOverlap,
    readModelPart,
    restoreModelParts,
} from './diffModelDocuments';

const base = `type: model
name: orders
label: Orders
sql_from: public.orders
dimensions:
  - name: amount
    type: number
    sql: amount
    metrics:
      revenue:
        type: sum
  - name: status
    type: string
    sql: status
metrics:
  ratio:
    type: number
    sql: a / b
joins:
  - join: customers
    sql_on: x = y
`;

const paths = (after: string) =>
    diffModelDocuments(base, after).map(({ path, kind }) => `${kind} ${path}`);

describe('diffModelDocuments', () => {
    it('finds nothing between a model and itself, whatever its formatting', () => {
        expect(diffModelDocuments(base, base)).toEqual([]);
        expect(
            diffModelDocuments(
                base,
                base.replace('label: Orders', 'label:   Orders'),
            ),
        ).toEqual([]);
    });

    it('names each part that changed the way a fragment would', () => {
        expect(
            paths(base.replace('label: Orders', 'label: All orders')),
        ).toEqual(['changed label']);
        expect(paths(base.replace('sql: amount', 'sql: amount * 100'))).toEqual(
            ['changed dimensions.amount.sql'],
        );
        expect(paths(base.replace('type: sum', 'type: max'))).toEqual([
            'changed dimensions.amount.metrics.revenue.type',
        ]);
        expect(paths(base.replace('sql: a / b', 'sql: a / c'))).toEqual([
            'changed metrics.ratio.sql',
        ]);
        expect(paths(base.replace('sql_on: x = y', 'sql_on: x = z'))).toEqual([
            'changed joins.customers.sql_on',
        ]);
    });

    it('tells a part that came from one that went', () => {
        expect(
            paths(
                base.replace(
                    '  - name: status\n    type: string\n    sql: status\n',
                    '',
                ),
            ),
        ).toEqual(['removed dimensions.status']);
        expect(
            paths(
                base.replace(
                    'metrics:\n  ratio:',
                    'metrics:\n  total:\n    type: number\n    sql: a\n  ratio:',
                ),
            ),
        ).toEqual(['added metrics.total']);
        expect(
            paths(
                base.replace(
                    '        type: sum\n',
                    '        type: sum\n      orders:\n        type: count\n',
                ),
            ),
        ).toEqual(['added dimensions.amount.metrics.orders']);
    });

    it('treats a model that came or went as the whole model', () => {
        expect(diffModelDocuments(null, base)).toEqual([
            { path: '', kind: 'added' },
        ]);
        expect(diffModelDocuments(base, null)).toEqual([
            { path: '', kind: 'removed' },
        ]);
        expect(diffModelDocuments(null, null)).toEqual([]);
    });
});

describe('doModelPathsOverlap', () => {
    it('holds for the same part and for a part inside another', () => {
        expect(
            doModelPathsOverlap('metrics.ratio.sql', 'metrics.ratio.sql'),
        ).toBe(true);
        expect(
            doModelPathsOverlap('dimensions.amount', 'dimensions.amount.sql'),
        ).toBe(true);
        expect(doModelPathsOverlap('', 'label')).toBe(true);
    });

    it('does not hold for neighbours, or names that only start alike', () => {
        expect(
            doModelPathsOverlap('metrics.ratio.sql', 'metrics.ratio.label'),
        ).toBe(false);
        expect(
            doModelPathsOverlap('dimensions.amount', 'dimensions.amount_usd'),
        ).toBe(false);
    });
});

describe('readModelPart', () => {
    it('reads a value, a definition and a nested one', () => {
        expect(readModelPart(base, 'label')).toBe('Orders');
        expect(readModelPart(base, 'dimensions.amount.sql')).toBe('amount');
        expect(readModelPart(base, 'dimensions.amount.metrics.revenue')).toBe(
            'type: sum',
        );
        expect(readModelPart(base, 'joins.customers.sql_on')).toBe('x = y');
    });

    it('is nothing for a part or a model that is not there', () => {
        expect(readModelPart(base, 'metrics.missing')).toBeNull();
        expect(readModelPart(base, 'dimensions.missing.sql')).toBeNull();
        expect(readModelPart(null, 'label')).toBeNull();
    });
});

describe('restoreModelParts', () => {
    const restore = (mine: string, live: string, path: string) =>
        restoreModelParts({ contents: mine, live, paths: [path] });

    it.each([
        [
            'a key of a nested metric',
            'dimensions.amount.metrics.revenue.type',
            base.replace('type: sum', 'type: max'),
        ],
        [
            'a top-level key',
            'label',
            base.replace('label: Orders', 'label: Sales'),
        ],
        [
            'a key of a join',
            'joins.customers.sql_on',
            base.replace('x = y', 'a = b'),
        ],
        [
            'a whole metric the draft redefined',
            'metrics.ratio',
            base.replace('sql: a / b', 'sql: b / a\n    label: Ratio'),
        ],
        [
            'a whole dimension the draft removed',
            'dimensions.status',
            base.replace(
                '  - name: status\n    type: string\n    sql: status\n',
                '',
            ),
        ],
        [
            'a whole metric the draft removed',
            'metrics.ratio',
            base.replace(
                'metrics:\n  ratio:\n    type: number\n    sql: a / b\n',
                '',
            ),
        ],
    ])('puts back %s', (_case, path, mine) => {
        expect(mine).not.toBe(base);
        const { contents, restored } = restore(mine, base, path);
        expect(restored).toEqual([path]);
        expect(readModelPart(contents, path)).toBe(readModelPart(base, path));
        expect(diffModelDocuments(base, contents)).toEqual([]);
    });

    it('removes what live does not have', () => {
        const live = base.replace(
            'metrics:\n  ratio:\n    type: number\n    sql: a / b\n',
            '',
        );
        const { contents, restored } = restore(base, live, 'metrics.ratio');
        expect(restored).toEqual(['metrics.ratio']);
        expect(readModelPart(contents, 'metrics.ratio')).toBeNull();
    });

    it('leaves no empty map behind when it removes the last nested definition', () => {
        const live = base.replace(
            '    metrics:\n      revenue:\n        type: sum\n',
            '',
        );
        const { contents } = restore(
            base,
            live,
            'dimensions.amount.metrics.revenue',
        );
        expect(contents).toBe(live);
    });

    it('keeps the rest of the draft', () => {
        const mine = base
            .replace('label: Orders', 'label: Sales')
            .replace('type: sum', 'type: max');
        const { contents } = restore(mine, base, 'label');
        expect(contents).toContain('label: Orders');
        expect(contents).toContain('type: max');
    });

    it('does nothing where the draft already matches', () => {
        expect(restore(base, base, 'label')).toEqual({
            contents: base,
            restored: [],
        });
    });
});
