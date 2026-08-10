import type { ProjectContextEntry } from '@lightdash/common';
import {
    buildProjectContextEntrySlug,
    hashProjectContextEntry,
    normalizeProjectContextContent,
    parseProjectContextEntrySlug,
} from './projectContextEntryIdentity';
import {
    planProjectContextReconcile,
    type ProjectContextExistingRow,
} from './projectContextReconcile';

const entry = (
    overrides: Partial<ProjectContextEntry> & Pick<ProjectContextEntry, 'id'>,
): ProjectContextEntry => ({
    kind: 'context',
    content: `Content for ${overrides.id}`,
    terms: [],
    objects: [],
    ...overrides,
});

const row = (
    overrides: Partial<ProjectContextExistingRow> &
        Pick<ProjectContextExistingRow, 'hash' | 'fileId'>,
): ProjectContextExistingRow => ({
    status: 'active',
    citedCount: 0,
    lastCitedAt: null,
    pulledCount: 0,
    lastPulledAt: null,
    ...overrides,
});

const rowFor = (
    e: ProjectContextEntry,
    overrides: Partial<ProjectContextExistingRow> = {},
): ProjectContextExistingRow =>
    row({ hash: hashProjectContextEntry(e), fileId: e.id, ...overrides });

describe('normalizeProjectContextContent', () => {
    test('trims and collapses internal whitespace so YAML round-trips keep identity', () => {
        expect(normalizeProjectContextContent('  a   b\n  c  ')).toBe('a b c');
    });
});

describe('hashProjectContextEntry', () => {
    test('is stable across re-wrapped content', () => {
        expect(
            hashProjectContextEntry({
                content: 'Revenue excludes refunds.',
                kind: 'definition',
            }),
        ).toBe(
            hashProjectContextEntry({
                content: '  Revenue excludes\n  refunds.  ',
                kind: 'definition',
            }),
        );
    });

    test('changes when kind changes', () => {
        expect(
            hashProjectContextEntry({ content: 'same', kind: 'definition' }),
        ).not.toBe(
            hashProjectContextEntry({ content: 'same', kind: 'context' }),
        );
    });

    test('ignores terms and objects', () => {
        const base = entry({ id: 'a', terms: ['x'] });
        const withDifferentMetadata = entry({
            id: 'b',
            content: base.content,
            terms: ['completely', 'different'],
            objects: [{ type: 'explore', name: 'orders' }],
        });
        expect(hashProjectContextEntry(base)).toBe(
            hashProjectContextEntry(withDifferentMetadata),
        );
    });
});

describe('buildProjectContextEntrySlug / parseProjectContextEntrySlug', () => {
    const hash = 'a'.repeat(64);

    test('is kebab prefix plus 8 hex chars', () => {
        expect(buildProjectContextEntrySlug('revenue-definition', hash)).toBe(
            'revenue-definition-aaaaaaaa',
        );
    });

    test('truncates a long file id to 40 chars', () => {
        const slug = buildProjectContextEntrySlug('x'.repeat(80), hash);
        expect(slug).toBe(`${'x'.repeat(40)}-aaaaaaaa`);
    });

    test('falls back when the file id has no slug characters', () => {
        expect(buildProjectContextEntrySlug('!!!', hash)).toBe(
            'entry-aaaaaaaa',
        );
    });

    test('round-trips the hash prefix', () => {
        const slug = buildProjectContextEntrySlug('Some Entry Id', hash);
        expect(parseProjectContextEntrySlug(slug)).toBe('aaaaaaaa');
    });

    test('resolves on the hash suffix even after the file id is renamed', () => {
        expect(
            parseProjectContextEntrySlug(
                buildProjectContextEntrySlug('brand-new-name', hash),
            ),
        ).toBe(
            parseProjectContextEntrySlug(
                buildProjectContextEntrySlug('old-name', hash),
            ),
        );
    });

    test.each(['no-suffix', 'entry-zzzzzzzz', 'entry-aaaa', ''])(
        'rejects %s',
        (slug) => {
            expect(parseProjectContextEntrySlug(slug)).toBeNull();
        },
    );
});

describe('planProjectContextReconcile', () => {
    test('inserts every entry on first ingest', () => {
        const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
        const plan = planProjectContextReconcile({
            existingRows: [],
            entries,
        });

        expect(plan.updates).toEqual([]);
        expect(plan.tombstonedHashes).toEqual([]);
        expect(plan.inserts).toHaveLength(2);
        expect(plan.inserts.map((i) => i.position)).toEqual([0, 1]);
        expect(plan.inserts[0]).toMatchObject({
            fileId: 'a',
            hash: hashProjectContextEntry(entries[0]),
            citedCount: 0,
            predecessorHash: null,
        });
    });

    test('re-ingesting an unchanged file writes no inserts or tombstones', () => {
        const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
        const plan = planProjectContextReconcile({
            existingRows: entries.map((e) => rowFor(e)),
            entries,
        });

        expect(plan.inserts).toEqual([]);
        expect(plan.tombstonedHashes).toEqual([]);
        expect(plan.updates).toHaveLength(2);
    });

    test('refreshes retrieval metadata in place when only terms change', () => {
        const before = entry({ id: 'a', terms: ['old'] });
        const after = entry({ id: 'a', terms: ['new'], title: 'A title' });
        const plan = planProjectContextReconcile({
            existingRows: [rowFor(before, { citedCount: 7 })],
            entries: [after],
        });

        expect(plan.inserts).toEqual([]);
        expect(plan.tombstonedHashes).toEqual([]);
        expect(plan.updates).toEqual([
            {
                hash: hashProjectContextEntry(after),
                slug: buildProjectContextEntrySlug(
                    'a',
                    hashProjectContextEntry(after),
                ),
                fileId: 'a',
                title: 'A title',
                apply: null,
                terms: ['new'],
                objects: [],
                position: 0,
            },
        ]);
    });

    test('an edited entry tombstones the old row and carries its telemetry forward', () => {
        const before = entry({ id: 'a', content: 'Old wording.' });
        const after = entry({ id: 'a', content: 'New wording.' });
        const lastCitedAt = new Date('2026-01-01T00:00:00Z');
        const plan = planProjectContextReconcile({
            existingRows: [
                rowFor(before, {
                    citedCount: 4,
                    lastCitedAt,
                    pulledCount: 9,
                }),
            ],
            entries: [after],
        });

        expect(plan.tombstonedHashes).toEqual([
            hashProjectContextEntry(before),
        ]);
        expect(plan.inserts).toHaveLength(1);
        expect(plan.inserts[0]).toMatchObject({
            hash: hashProjectContextEntry(after),
            predecessorHash: hashProjectContextEntry(before),
            citedCount: 4,
            lastCitedAt,
            pulledCount: 9,
        });
    });

    test('a new entry with an unrelated file id starts telemetry at zero', () => {
        const before = entry({ id: 'a', content: 'Old wording.' });
        const after = entry({ id: 'b', content: 'New wording.' });
        const plan = planProjectContextReconcile({
            existingRows: [rowFor(before, { citedCount: 4 })],
            entries: [after],
        });

        expect(plan.inserts[0]).toMatchObject({
            predecessorHash: null,
            citedCount: 0,
        });
    });

    test('an entry removed from the file is tombstoned, never dropped', () => {
        const kept = entry({ id: 'a' });
        const removed = entry({ id: 'b' });
        const plan = planProjectContextReconcile({
            existingRows: [rowFor(kept), rowFor(removed)],
            entries: [kept],
        });

        expect(plan.tombstonedHashes).toEqual([
            hashProjectContextEntry(removed),
        ]);
        expect(plan.inserts).toEqual([]);
    });

    test('an empty file tombstones every active row', () => {
        const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
        const plan = planProjectContextReconcile({
            existingRows: entries.map((e) => rowFor(e)),
            entries: [],
        });

        expect(plan.tombstonedHashes).toHaveLength(2);
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
    });

    test('a reverted file un-tombstones the matching hash with telemetry intact', () => {
        const reverted = entry({ id: 'a' });
        const plan = planProjectContextReconcile({
            existingRows: [
                rowFor(reverted, { status: 'removed', citedCount: 12 }),
            ],
            entries: [reverted],
        });

        expect(plan.inserts).toEqual([]);
        expect(plan.tombstonedHashes).toEqual([]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].hash).toBe(hashProjectContextEntry(reverted));
    });

    test('an already-removed row is not tombstoned again', () => {
        const gone = entry({ id: 'a' });
        const plan = planProjectContextReconcile({
            existingRows: [rowFor(gone, { status: 'removed' })],
            entries: [],
        });

        expect(plan.tombstonedHashes).toEqual([]);
    });

    test('duplicate content in one file collapses to a single row', () => {
        const first = entry({ id: 'a', content: 'Same sentence.' });
        const duplicate = entry({ id: 'b', content: 'Same sentence.' });
        const plan = planProjectContextReconcile({
            existingRows: [],
            entries: [first, duplicate],
        });

        expect(plan.inserts).toHaveLength(1);
        expect(plan.inserts[0].fileId).toBe('a');
    });
});
