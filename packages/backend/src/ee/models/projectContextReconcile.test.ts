import { type ProjectContextEntry } from '@lightdash/common';
import {
    computeProjectContextEntryHash,
    computeProjectContextReconcilePlan,
    type ProjectContextEntryRowState,
} from './projectContextReconcile';

const entry = (
    overrides: Partial<ProjectContextEntry> & Pick<ProjectContextEntry, 'id'>,
): ProjectContextEntry => ({
    kind: 'context',
    content: `content for ${overrides.id}`,
    terms: [],
    objects: [],
    ...overrides,
});

const rowFor = (
    e: ProjectContextEntry,
    overrides: Partial<ProjectContextEntryRowState> = {},
): ProjectContextEntryRowState => ({
    hash: computeProjectContextEntryHash(e),
    status: 'active',
    entry_id: e.id,
    content: e.content,
    title: e.title ?? null,
    apply: e.apply ?? null,
    terms: e.terms,
    objects: e.objects,
    ...overrides,
});

describe('computeProjectContextEntryHash', () => {
    test('is stable across whitespace-only content changes', () => {
        const a = computeProjectContextEntryHash({
            kind: 'context',
            content: 'Revenue  excludes\n refunds.',
        });
        const b = computeProjectContextEntryHash({
            kind: 'context',
            content: '  Revenue excludes refunds.  ',
        });
        expect(a).toBe(b);
    });

    test('changes with content and with kind', () => {
        const base = computeProjectContextEntryHash({
            kind: 'context',
            content: 'Revenue excludes refunds.',
        });
        expect(
            computeProjectContextEntryHash({
                kind: 'context',
                content: 'Revenue includes refunds.',
            }),
        ).not.toBe(base);
        expect(
            computeProjectContextEntryHash({
                kind: 'definition',
                content: 'Revenue excludes refunds.',
            }),
        ).not.toBe(base);
    });
});

describe('computeProjectContextReconcilePlan', () => {
    test('an unchanged file is a no-op', () => {
        const a = entry({ id: 'a' });
        const b = entry({ id: 'b' });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(a), rowFor(b)],
            incoming: [a, b],
        });
        expect(plan).toEqual({
            inserts: [],
            updates: [],
            tombstoneHashes: [],
        });
    });

    test('new entries insert with their hash', () => {
        const a = entry({ id: 'a' });
        const plan = computeProjectContextReconcilePlan({
            existing: [],
            incoming: [a],
        });
        expect(plan.inserts).toEqual([
            { ...a, hash: computeProjectContextEntryHash(a) },
        ]);
        expect(plan.updates).toEqual([]);
        expect(plan.tombstoneHashes).toEqual([]);
    });

    test('editing content creates a new row and tombstones the old one', () => {
        const before = entry({ id: 'a', content: 'old fact' });
        const after = entry({ id: 'a', content: 'new fact' });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(before)],
            incoming: [after],
        });
        expect(plan.inserts.map((e) => e.id)).toEqual(['a']);
        expect(plan.tombstoneHashes).toEqual([
            computeProjectContextEntryHash(before),
        ]);
    });

    test('same hash with changed retrieval metadata updates in place', () => {
        const before = entry({ id: 'a', content: 'a fact', terms: ['old'] });
        const after = entry({
            id: 'a-renamed',
            content: 'a fact',
            terms: ['new'],
        });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(before)],
            incoming: [after],
        });
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([
            { ...after, hash: computeProjectContextEntryHash(after) },
        ]);
        expect(plan.tombstoneHashes).toEqual([]);
    });

    test('whitespace-only content change updates in place, not a new row', () => {
        const before = entry({ id: 'a', content: 'a fact' });
        const after = entry({ id: 'a', content: '  a\n fact ' });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(before)],
            incoming: [after],
        });
        expect(plan.inserts).toEqual([]);
        expect(plan.updates.map((e) => e.content)).toEqual(['  a\n fact ']);
        expect(plan.tombstoneHashes).toEqual([]);
    });

    test('a reappearing hash un-tombstones instead of inserting', () => {
        const a = entry({ id: 'a' });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(a, { status: 'removed' })],
            incoming: [a],
        });
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([
            { ...a, hash: computeProjectContextEntryHash(a) },
        ]);
        expect(plan.tombstoneHashes).toEqual([]);
    });

    test('an empty file tombstones every active row and leaves removed rows alone', () => {
        const a = entry({ id: 'a' });
        const b = entry({ id: 'b' });
        const plan = computeProjectContextReconcilePlan({
            existing: [rowFor(a), rowFor(b, { status: 'removed' })],
            incoming: [],
        });
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.tombstoneHashes).toEqual([
            computeProjectContextEntryHash(a),
        ]);
    });

    test('duplicate hashes within the file collapse to the first entry', () => {
        const first = entry({ id: 'a', content: 'same fact' });
        const second = entry({ id: 'b', content: 'same fact' });
        const plan = computeProjectContextReconcilePlan({
            existing: [],
            incoming: [first, second],
        });
        expect(plan.inserts.map((e) => e.id)).toEqual(['a']);
    });
});
