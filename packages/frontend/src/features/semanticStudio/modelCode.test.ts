import { type SemanticLayerDraft } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countChangedLines,
    getChangeKind,
    describeFieldChanges,
    describeModelChange,
    findPeekStart,
    changeTitle,
    countPublishedChanges,
    findFieldBlock,
    findFieldLine,
    listFieldChanges,
    listPublishedParts,
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

describe('findFieldBlock', () => {
    it.each([
        ['a field with nested lines', 'amount', { start: 4, end: 8 }],
        ['a nested field', 'p90_amount', { start: 7, end: 8 }],
        ['nothing for an unknown field', 'missing', null],
    ])('covers %s', (_case, field, block) => {
        expect(findFieldBlock(YAML, field)).toEqual(block);
    });
});

describe('change copy', () => {
    it('names the question, or the source when there is none', () => {
        const contents = {
            contentBefore: 'name: a\nlabel: A\nmetrics:\n  m:\n    sql: x\n',
            contentAfter: 'name: a\nlabel: B\nmetrics:\n  m:\n    sql: y\n',
        };
        expect(
            changeTitle({
                source: 'draft',
                question: 'Approval rate?',
                ...contents,
            }),
        ).toBe('Approval rate?');
        expect(
            changeTitle({ source: 'draft', question: null, ...contents }),
        ).toBe('Changed label and sql of m');
        expect(
            changeTitle({
                source: 'draft',
                question: null,
                contentBefore: null,
                contentAfter: contents.contentAfter,
            }),
        ).toBe('Published a new model');
        expect(
            changeTitle({ source: 'undo', question: null, ...contents }),
        ).toBe('Undid an earlier change');
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

describe('listFieldChanges', () => {
    const before = [
        'type: model',
        'name: rounds',
        'dimensions:',
        '  - name: points',
        '    label: Points',
        '    type: number',
        '    metrics:',
        '      old_points:',
        '        label: Old points',
        '        type: sum',
    ].join('\n');
    const after = [
        'type: model',
        'name: rounds',
        'label: Rounds',
        'dimensions:',
        '  - name: points',
        '    label: Round points',
        '    type: number',
        '    metrics:',
        '      avg_points:',
        '        label: Average points',
        '        type: average',
        'metrics:',
        '  total:',
        '    type: sum',
        '    sql: ${points}',
        'joins:',
        '  - join: drivers',
    ].join('\n');

    it('names each field once, labelled from the side that still has it', () => {
        expect(
            listFieldChanges(
                'rounds',
                [
                    { path: 'dimensions.points.label', action: 'patched' },
                    {
                        path: 'dimensions.points.metrics.avg_points',
                        action: 'added',
                    },
                    {
                        path: 'dimensions.points.metrics.avg_points.label',
                        action: 'patched',
                    },
                    {
                        path: 'dimensions.points.metrics.old_points',
                        action: 'removed',
                    },
                    { path: 'metrics.total', action: 'added' },
                    { path: 'joins.drivers', action: 'added' },
                    { path: 'label', action: 'patched' },
                ],
                { contentBefore: before, contentAfter: after },
            ),
        ).toEqual([
            {
                kind: 'dimension',
                name: 'points',
                change: 'changed',
                label: 'Round points',
                type: 'number',
                detail: 'label',
            },
            {
                kind: 'metric',
                name: 'avg_points',
                change: 'new',
                label: 'Average points',
                type: 'average',
                detail: 'average of points',
            },
            {
                kind: 'metric',
                name: 'old_points',
                change: 'removed',
                label: 'Old points',
                type: 'sum',
                detail: null,
            },
            {
                kind: 'metric',
                name: 'total',
                change: 'new',
                label: 'total',
                type: 'sum',
                detail: 'sum of points',
            },
            {
                kind: 'join',
                name: 'drivers',
                change: 'new',
                label: 'drivers',
                type: null,
                detail: null,
            },
            {
                kind: 'model',
                name: 'rounds',
                change: 'changed',
                label: 'Rounds',
                type: null,
                detail: 'label',
            },
        ]);
    });

    it('leaves a whole new model to its header', () => {
        expect(
            listFieldChanges(
                'rounds',
                [{ path: 'rounds', action: 'created' }],
                {
                    contentBefore: null,
                    contentAfter: after,
                },
            ),
        ).toEqual([]);
    });
});

describe('countChangedLines', () => {
    it('counts the lines a change adds and removes', () => {
        expect(
            countChangedLines({
                contentBefore: 'a\nb\nc\n',
                contentAfter: 'a\nB\nc\nd\n',
            }),
        ).toEqual({ additions: 2, deletions: 1 });
        expect(
            countChangedLines({ contentBefore: null, contentAfter: 'a\nb\n' }),
        ).toEqual({ additions: 2, deletions: 0 });
    });
});

describe('describeFieldChanges', () => {
    const field = (
        kind: 'metric' | 'dimension',
        change: 'new' | 'changed',
        label: string,
    ) => ({ kind, change, label, name: label, type: null, detail: null });

    it('groups fields by what happened to them and their kind', () => {
        expect(
            describeFieldChanges([
                field('metric', 'new', 'Podium Rate'),
                field('dimension', 'changed', 'Status'),
                field('metric', 'new', 'Win Rate'),
            ]),
        ).toBe(
            'Added 2 metrics: Podium Rate, Win Rate. Changed 1 dimension: Status',
        );
    });

    it('is empty when no field changed', () => {
        expect(describeFieldChanges([])).toBe('');
    });
});

describe('listPublishedParts', () => {
    const content = [
        'type: model',
        'name: orders',
        'dimensions:',
        '  - name: amount',
        '    type: number',
        '    metrics:',
        '      total:',
        '        type: sum',
        '        description: Sum of amounts',
    ].join('\n');
    const entry = {
        model: 'orders',
        contentBefore: null,
        contentAfter: content,
        explore: null,
        reconciliation: null,
        alsoChanging: [],
        publishedSince: null,
    };
    const draft: SemanticLayerDraft = {
        changes: [
            {
                draftChangeUuid: 'created',
                question: null,
                createdAt: new Date(0),
                models: [
                    {
                        model: 'orders',
                        changes: [{ path: 'orders', action: 'created' }],
                        refusals: [],
                        error: null,
                    },
                ],
            },
            {
                draftChangeUuid: 'described',
                question: null,
                createdAt: new Date(1),
                models: [
                    {
                        model: 'orders',
                        changes: [
                            {
                                path: 'dimensions.amount.metrics.total.description',
                                action: 'patched',
                            },
                        ],
                        refusals: [],
                        error: null,
                    },
                ],
            },
        ],
        models: [entry],
        errors: [],
        settled: [],
        inReview: [],
        othersDrafting: [],
    };

    it('counts a model new as a whole as one change, however many edits built it', () => {
        expect(listPublishedParts(draft, entry)).toEqual([]);
        expect(countPublishedChanges(draft, null)).toBe(1);
    });
});
