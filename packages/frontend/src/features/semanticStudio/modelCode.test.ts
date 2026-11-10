import { describe, expect, it } from 'vitest';
import {
    getChangeKind,
    describeModelChange,
    findPeekStart,
    changeTitle,
    findFieldLine,
    summarizeModelChanges,
} from './modelCode';

const YAML = `type: model
name: payments
dimensions:
  - name: amount
    type: number
    metrics:
      p90_amount:
        type: percentile
  - name: "quoted"
    type: string
  - name: payments
    type: string`;

describe('findFieldLine', () => {
    it.each([
        ['a dimension', 'amount', 4],
        ['a metric under a dimension', 'p90_amount', 7],
        ['a quoted name', 'quoted', 9],
        ['a field named like its model, not the model', 'payments', 11],
        ['nothing for an unknown field', 'missing', null],
    ])('finds %s', (_case, field, line) => {
        expect(findFieldLine(YAML, field)).toBe(line);
    });
});

describe('change copy', () => {
    it('names the question, or the source when there is none', () => {
        expect(
            changeTitle({ source: 'draft', question: 'Approval rate?' }),
        ).toBe('Approval rate?');
        expect(changeTitle({ source: 'draft', question: null })).toBe(
            'Applied a draft',
        );
        expect(changeTitle({ source: 'undo', question: null })).toBe(
            'Undid an earlier change',
        );
    });

    it('tells a creation and a removal from an edit', () => {
        expect(getChangeKind({ contentBefore: null, contentAfter: 'a' })).toBe(
            'new',
        );
        expect(getChangeKind({ contentBefore: 'a', contentAfter: null })).toBe(
            'removed',
        );
        expect(getChangeKind({ contentBefore: 'a', contentAfter: 'b' })).toBe(
            'changed',
        );
    });
});

describe('summarizeModelChanges', () => {
    it('words whole parts and groups the keys of one field', () => {
        expect(
            summarizeModelChanges('orders', [
                { path: 'dimensions.amount.label', action: 'patched' },
                { path: 'dimensions.amount.sql', action: 'redefined' },
                { path: 'dimensions.seq', action: 'removed' },
                {
                    path: 'dimensions.amount.metrics.total',
                    action: 'added',
                },
                {
                    path: 'dimensions.amount.metrics.total.sql',
                    action: 'patched',
                },
                { path: 'label', action: 'patched' },
            ]),
        ).toEqual([
            'Removes seq',
            'Adds total',
            'Redefines amount: label, sql',
            'Updates total: sql',
            'Updates orders: label',
        ]);
    });

    it('words a whole model', () => {
        expect(
            summarizeModelChanges('orders', [
                { path: 'orders', action: 'created' },
            ]),
        ).toEqual(['Adds orders']);
        expect(
            summarizeModelChanges('orders', [
                { path: 'orders', action: 'removed' },
            ]),
        ).toEqual(['Removes orders']);
    });
});

describe('describeModelChange', () => {
    const content = [
        'type: model',
        'name: orders',
        'label: Orders',
        'dimensions:',
        '  - name: id',
        '    metrics:',
        '      order_count:',
        '        type: count',
        '  - name: amount',
        'metrics:',
        '  revenue:',
        '    type: sum',
    ].join('\n');

    it('counts what a new model holds, including metrics on its dimensions', () => {
        expect(
            describeModelChange('orders', {
                contentBefore: null,
                contentAfter: content,
            }),
        ).toEqual({
            title: 'Orders',
            subtitle: 'New · 2 dimensions · 2 metrics',
        });
    });

    it('only names a changed model', () => {
        expect(
            describeModelChange('orders', {
                contentBefore: content,
                contentAfter: content,
            }),
        ).toEqual({ title: 'Orders', subtitle: null });
    });

    it('says a model was removed', () => {
        expect(
            describeModelChange('orders', {
                contentBefore: content,
                contentAfter: null,
            }),
        ).toEqual({ title: 'Orders', subtitle: 'Removed' });
    });

    it('falls back to the name when the YAML cannot be read', () => {
        expect(
            describeModelChange('orders', {
                contentBefore: null,
                contentAfter: 'a: [',
            }),
        ).toEqual({ title: 'orders', subtitle: null });
    });
});

describe('findPeekStart', () => {
    it('starts at the first metrics block, nested or not', () => {
        expect(
            findPeekStart([
                'name: a',
                'dimensions:',
                '  - name: b',
                '    metrics:',
            ]),
        ).toBe(3);
    });

    it('starts at the top of a model with no metrics', () => {
        expect(findPeekStart(['name: a', 'dimensions:'])).toBe(0);
    });
});
