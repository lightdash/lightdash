import { SEED_PROJECT, type ProjectContextEntry } from '@lightdash/common';
import type { Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import {
    ProjectContextDocumentTableName,
    ProjectContextEntriesTableName,
} from '../database/entities/projectContext';
import { ProjectContextModel } from './ProjectContextModel';

describe('ProjectContextModel integration', () => {
    let database: Knex;
    let model: ProjectContextModel;

    const projectUuid = SEED_PROJECT.project_uuid;

    const entry = (
        overrides: Partial<ProjectContextEntry> &
            Pick<ProjectContextEntry, 'id'>,
    ): ProjectContextEntry => ({
        kind: 'context',
        content: `content for ${overrides.id}`,
        terms: [],
        objects: [],
        ...overrides,
    });

    const allRows = () =>
        database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('entry_id');

    beforeAll(() => {
        database = getTestContext().db;
        model = getTestContext()
            .app.getModels()
            .getProjectContextModel<ProjectContextModel>();
    });

    afterEach(async () => {
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .delete();
        await database(ProjectContextDocumentTableName)
            .where('project_uuid', projectUuid)
            .delete();
    });

    test('ingest yields rows with stable slugs; re-ingesting unchanged is a no-op', async () => {
        const entries = [
            entry({ id: 'revenue-definition', terms: ['revenue'] }),
            entry({ id: 'orders-routing' }),
        ];
        await model.reconcileEntriesForProject(projectUuid, entries);

        const first = await model.getDocument(projectUuid);
        expect(first).toHaveLength(2);
        for (const documentEntry of first) {
            expect(documentEntry.slug).toMatch(
                new RegExp(`^${documentEntry.id}-[0-9a-f]{8}$`),
            );
        }

        const rowsBefore = await allRows();
        await model.reconcileEntriesForProject(projectUuid, entries);
        const rowsAfter = await allRows();
        expect(rowsAfter).toEqual(rowsBefore);
        expect(await model.getDocument(projectUuid)).toEqual(first);
    });

    test('editing content creates a new row; the old slug still resolves to the old content', async () => {
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a', content: 'the old fact' }),
        ]);
        const [oldEntry] = await model.getDocument(projectUuid);
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .update({ cited_count: 5, pulled_count: 7 });

        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a', content: 'the new fact' }),
        ]);

        const rows = await allRows();
        expect(rows).toHaveLength(2);
        const oldResolved = await model.findEntryBySlug(
            projectUuid,
            oldEntry.slug,
        );
        expect(oldResolved).toMatchObject({
            content: 'the old fact',
            status: 'removed',
            citedCount: 5,
        });

        const active = await model.getDocument(projectUuid);
        expect(active).toHaveLength(1);
        expect(active[0].content).toBe('the new fact');
        expect(active[0].slug).not.toBe(oldEntry.slug);
    });

    test('metadata-only change keeps the row and telemetry', async () => {
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a', content: 'a durable fact', terms: ['old'] }),
        ]);
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .update({ pulled_count: 3 });

        await model.reconcileEntriesForProject(projectUuid, [
            entry({
                id: 'a-renamed',
                content: 'a durable fact',
                terms: ['new'],
                title: 'A title',
            }),
        ]);

        const rows = await allRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            entry_id: 'a-renamed',
            terms: ['new'],
            title: 'A title',
            pulled_count: 3,
            status: 'active',
        });
    });

    test('an empty file tombstones all; a revert un-tombstones with telemetry intact', async () => {
        const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
        await model.reconcileEntriesForProject(projectUuid, entries);
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .update({ cited_count: 2 });

        await model.reconcileEntriesForProject(projectUuid, []);
        expect(await model.getDocument(projectUuid)).toEqual([]);
        const tombstoned = await allRows();
        expect(tombstoned.map((row) => row.status)).toEqual([
            'removed',
            'removed',
        ]);

        await model.reconcileEntriesForProject(projectUuid, entries);
        const revived = await allRows();
        expect(revived.map((row) => row.status)).toEqual(['active', 'active']);
        expect(revived.map((row) => row.cited_count)).toEqual([2, 2]);
    });

    test('concurrent reconciles serialize; exactly one revision stays active', async () => {
        const revisionA = [entry({ id: 'a1' }), entry({ id: 'a2' })];
        const revisionB = [entry({ id: 'b1' })];

        await Promise.all([
            model.reconcileEntriesForProject(projectUuid, revisionA),
            model.reconcileEntriesForProject(projectUuid, revisionB),
        ]);

        // Either order is fine, but never a union of both revisions.
        const activeIds = (await model.getDocument(projectUuid))
            .map((documentEntry) => documentEntry.id)
            .sort();
        expect([['a1', 'a2'], ['b1']]).toContainEqual(activeIds);
    });

    test('reconcile dual-writes the legacy blob document on every transition', async () => {
        const blob = () =>
            database(ProjectContextDocumentTableName)
                .where('project_uuid', projectUuid)
                .first();

        const entries = [entry({ id: 'a', terms: ['a'] })];
        await model.reconcileEntriesForProject(projectUuid, entries);
        expect((await blob())?.entries).toEqual(entries);

        const changed = [
            entry({ id: 'a', terms: ['a'], content: 'changed content' }),
        ];
        await model.reconcileEntriesForProject(projectUuid, changed);
        expect((await blob())?.entries).toEqual(changed);

        await model.reconcileEntriesForProject(projectUuid, []);
        expect((await blob())?.entries).toEqual([]);
    });

    test('findEntryBySlug matches on the hash suffix only, any status', async () => {
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'revenue-definition' }),
        ]);
        const [documentEntry] = await model.getDocument(projectUuid);
        const hash8 = documentEntry.slug.slice(-8);

        // A churned/cosmetic prefix still resolves.
        const resolved = await model.findEntryBySlug(
            projectUuid,
            `renamed-prefix-${hash8}`,
        );
        expect(resolved?.slug).toBe(documentEntry.slug);
        expect(resolved?.status).toBe('active');

        expect(
            await model.findEntryBySlug(projectUuid, 'not-a-slug'),
        ).toBeUndefined();
        expect(
            await model.findEntryBySlug(projectUuid, 'missing-00000000'),
        ).toBeUndefined();
    });

    test('incrementPulledBySlugs bumps telemetry for active rows', async () => {
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a' }),
            entry({ id: 'b' }),
        ]);
        const [a] = await model.getDocument(projectUuid);

        await model.incrementPulledBySlugs(projectUuid, [a.slug]);
        await model.incrementPulledBySlugs(projectUuid, [a.slug]);

        const rows = await allRows();
        const pulled = new Map(
            rows.map((row) => [row.entry_id, row.pulled_count]),
        );
        expect(pulled.get('a')).toBe(2);
        expect(pulled.get('b')).toBe(0);
        expect(
            rows.find((row) => row.entry_id === 'a')?.last_pulled_at,
        ).not.toBeNull();
    });

    test('incrementCitedBySlugs bumps active rows only and reports the updated count', async () => {
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a' }),
            entry({ id: 'b' }),
        ]);
        const [a, b] = await model.getDocument(projectUuid);
        // Tombstone b: citations of removed entries must not count.
        await model.reconcileEntriesForProject(projectUuid, [
            entry({ id: 'a' }),
        ]);

        const updated = await model.incrementCitedBySlugs(projectUuid, [
            a.slug,
            b.slug,
            'unknown-slug-00000000',
        ]);
        expect(updated).toBe(1);

        const rows = await allRows();
        const cited = new Map(
            rows.map((row) => [row.entry_id, row.cited_count]),
        );
        expect(cited.get('a')).toBe(1);
        expect(cited.get('b')).toBe(0);
        expect(
            rows.find((row) => row.entry_id === 'a')?.last_cited_at,
        ).not.toBeNull();
        expect(
            rows.find((row) => row.entry_id === 'b')?.last_cited_at,
        ).toBeNull();
    });

    test('an ambiguous hash8 increments no rows, like findEntryBySlug', async () => {
        const row = (hash: string, entryId: string) => ({
            project_uuid: projectUuid,
            hash,
            entry_id: entryId,
            kind: 'context' as const,
            content: `content for ${entryId}`,
            terms: JSON.stringify([]),
            objects: JSON.stringify([]),
            status: 'active' as const,
        });
        await database(ProjectContextEntriesTableName).insert([
            row(`aabbccdd${'1'.repeat(56)}`, 'colliding-a'),
            row(`aabbccdd${'2'.repeat(56)}`, 'colliding-b'),
            row(`11223344${'f'.repeat(56)}`, 'unique'),
        ]);

        const updated = await model.incrementCitedBySlugs(projectUuid, [
            'colliding-aabbccdd',
            'unique-11223344',
        ]);
        expect(updated).toBe(1);

        const rows = await allRows();
        const cited = new Map(rows.map((r) => [r.entry_id, r.cited_count]));
        expect(cited.get('colliding-a')).toBe(0);
        expect(cited.get('colliding-b')).toBe(0);
        expect(cited.get('unique')).toBe(1);
    });
});
