import { describe, expect, it } from 'vitest';
import { findDraftedPaths, reconcileModel } from './reconcileDraft';

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

    it('is current when nothing was published', () => {
        expect(
            reconcileModel({
                base,
                live: base,
                mine: model({ total: 'b' }),
                draftedPaths: ['metrics.total.sql'],
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
            }).state,
        ).toBe('merged');
    });

    it('holds a change inside a part the other side removed under the outer part', () => {
        const { state, conflicts } = reconcileModel({
            base,
            live: model({}),
            mine: model({ total: 'b' }),
            draftedPaths: ['metrics.total.sql', 'metrics.total.type'],
        });
        expect(state).toBe('conflict');
        expect(conflicts.map(({ path }) => path)).toEqual(['metrics.total']);
        expect(conflicts[0].live).toBeNull();
    });

    it('conflicts on the whole model when it was removed live', () => {
        const { conflicts } = reconcileModel({
            base,
            live: null,
            mine: model({ total: 'b' }),
            draftedPaths: ['metrics.total.sql'],
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
