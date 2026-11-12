import { describe, expect, it } from 'vitest';
import { foldDraft } from './draftFold';
import {
    findDraftedPaths,
    findRefusedPaths,
    reconcileModel,
} from './reconcileDraft';

const model = (metrics: Record<string, string>, label = 'Things') =>
    [
        'type: model',
        'name: things',
        `label: ${label}`,
        'metrics:',
        ...Object.entries(metrics).flatMap(([name, sql]) => [
            `  ${name}:`,
            '    type: sum',
            `    sql: ${sql}`,
        ]),
    ].join('\n');

describe('reconcileModel', () => {
    const base = model({ total: 'a' });
    const noRefusals = { refusedPaths: [], wanted: null };

    it('is current when nothing was published', () => {
        expect(
            reconcileModel({
                base,
                live: base,
                mine: model({ total: 'b' }),
                draftedPaths: ['metrics.total.sql'],
                ...noRefusals,
            }),
        ).toEqual({ state: 'current', merged: [], conflicts: [] });
    });

    it('merges what was published elsewhere in the model', () => {
        expect(
            reconcileModel({
                base,
                live: model({ total: 'a' }, 'Renamed'),
                mine: model({ total: 'b' }, 'Renamed'),
                draftedPaths: ['metrics.total.sql'],
                ...noRefusals,
            }),
        ).toEqual({ state: 'merged', merged: ['label'], conflicts: [] });
    });

    it('reports each side of a part both changed', () => {
        expect(
            reconcileModel({
                base,
                live: model({ total: 'c' }),
                mine: model({ total: 'b' }),
                draftedPaths: ['metrics.total.sql'],
                ...noRefusals,
            }),
        ).toEqual({
            state: 'conflict',
            merged: [],
            conflicts: [
                { path: 'metrics.total.sql', base: 'a', live: 'c', mine: 'b' },
            ],
        });
    });

    it('does not call the same change on both sides a conflict', () => {
        expect(
            reconcileModel({
                base,
                live: model({ total: 'b' }),
                mine: model({ total: 'b' }),
                draftedPaths: ['metrics.total.sql'],
                ...noRefusals,
            }).state,
        ).toBe('merged');
    });

    it('holds a change inside a part the other side removed under the outer part', () => {
        const { state, conflicts } = reconcileModel({
            base,
            live: model({}),
            mine: model({ total: 'b' }),
            draftedPaths: ['metrics.total.sql', 'metrics.total.type'],
            ...noRefusals,
        });
        expect(state).toBe('conflict');
        expect(conflicts.map(({ path }) => path)).toEqual(['metrics.total']);
        expect(conflicts[0].live).toBeNull();
    });

    it('conflicts on an edit to a part the other side removed, through the replayed draft', () => {
        const changes = [
            [
                {
                    name: 'things',
                    yaml: 'metrics:\n  total:\n    sql: b\n',
                    remove: [],
                    removeModel: false,
                },
            ],
        ];
        const header = [
            'type: model',
            'name: things',
            'sql_from: things',
            'dimensions:',
            '  - name: id',
            '    type: number',
            '    sql: id',
        ].join('\n');
        const live = `${header}\n`;
        const based = `${header}\nmetrics:\n  total:\n    type: sum\n    sql: a\n`;
        const replayed = foldDraft(new Map([['things', live]]), changes);
        const results = replayed.results.flat();
        const { state, conflicts } = reconcileModel({
            base: based,
            live,
            mine: replayed.writes.get('things') ?? live,
            draftedPaths: findDraftedPaths('things', results),
            refusedPaths: findRefusedPaths('things', results),
            wanted:
                foldDraft(new Map([['things', based]]), changes).writes.get(
                    'things',
                ) ?? null,
        });
        expect(state).toBe('conflict');
        expect(conflicts).toEqual([
            {
                path: 'metrics.total',
                base: 'type: sum\nsql: a',
                live: null,
                mine: 'type: sum\nsql: b',
            },
        ]);
    });

    it('conflicts on the whole model when it was removed live', () => {
        const { conflicts } = reconcileModel({
            base,
            live: null,
            mine: model({ total: 'b' }),
            draftedPaths: ['metrics.total.sql'],
            ...noRefusals,
        });
        expect(conflicts.map(({ path }) => path)).toEqual(['']);
    });
});

describe('findDraftedPaths', () => {
    it('reads creating a model as the whole model', () => {
        expect(
            findDraftedPaths('things', [
                {
                    model: 'things',
                    status: 'ready',
                    changes: [{ path: 'things', action: 'created' }],
                    refusals: [],
                    error: null,
                    notes: [],
                },
                {
                    model: 'other',
                    status: 'ready',
                    changes: [{ path: 'label', action: 'patched' }],
                    refusals: [],
                    error: null,
                    notes: [],
                },
            ]),
        ).toEqual(['']);
    });
});
