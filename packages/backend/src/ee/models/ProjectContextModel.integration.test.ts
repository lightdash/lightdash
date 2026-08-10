import { SEED_PROJECT, type ProjectContextEntry } from '@lightdash/common';
import type { Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import { ProjectContextEntriesTableName } from '../database/entities/projectContext';
import {
    buildProjectContextEntrySlug,
    hashProjectContextEntry,
} from './projectContextEntryIdentity';
import { ProjectContextModel } from './ProjectContextModel';

const PROJECT_UUID = SEED_PROJECT.project_uuid;

const entry = (
    id: string,
    content: string,
    overrides: Partial<ProjectContextEntry> = {},
): ProjectContextEntry => ({
    id,
    kind: 'context',
    content,
    terms: [],
    objects: [],
    ...overrides,
});

const slugOf = (e: ProjectContextEntry): string =>
    buildProjectContextEntrySlug(e.id, hashProjectContextEntry(e));

describe('ProjectContextModel reconcile integration', () => {
    let database: Knex;
    let model: ProjectContextModel;

    beforeAll(() => {
        database = getTestContext().db;
        model = new ProjectContextModel({ database });
    });

    beforeEach(async () => {
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', PROJECT_UUID)
            .delete();
    });

    afterAll(async () => {
        await database(ProjectContextEntriesTableName)
            .where('project_uuid', PROJECT_UUID)
            .delete();
    });

    const rowsForProject = () =>
        database(ProjectContextEntriesTableName)
            .where('project_uuid', PROJECT_UUID)
            .orderBy('position');

    test('ingest creates rows with stable slugs and re-ingest is a no-op', async () => {
        const entries = [
            entry('revenue-definition', 'Revenue excludes refunds.', {
                kind: 'definition',
                terms: ['revenue'],
            }),
            entry('order-routing', 'Route orders through the fct model.'),
        ];

        await model.replaceEntriesForProject(PROJECT_UUID, entries);
        const first = await rowsForProject();
        expect(first).toHaveLength(2);
        expect(first.map((r) => r.slug)).toEqual(entries.map(slugOf));

        await model.replaceEntriesForProject(PROJECT_UUID, entries);
        const second = await rowsForProject();
        expect(second).toHaveLength(2);
        expect(second.map((r) => r.project_context_entry_uuid)).toEqual(
            first.map((r) => r.project_context_entry_uuid),
        );

        const active = await model.getActiveEntries(PROJECT_UUID);
        expect(active.map((e) => e.slug)).toEqual(entries.map(slugOf));
        expect(active[0]).toMatchObject({
            id: 'revenue-definition',
            kind: 'definition',
            content: 'Revenue excludes refunds.',
            terms: ['revenue'],
        });
    });

    test('editing content tombstones the old row, carries telemetry forward and keeps the old slug resolvable', async () => {
        const before = entry('revenue-definition', 'Revenue excludes refunds.');
        const after = entry(
            'revenue-definition',
            'Revenue excludes refunds and credits.',
        );

        await model.replaceEntriesForProject(PROJECT_UUID, [before]);
        await model.incrementCitedForEntries({
            projectUuid: PROJECT_UUID,
            slugs: [slugOf(before)],
        });

        await model.replaceEntriesForProject(PROJECT_UUID, [after]);

        const oldEntry = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(before),
        });
        expect(oldEntry).toMatchObject({
            status: 'removed',
            content: 'Revenue excludes refunds.',
            citedCount: 1,
            successorSlug: slugOf(after),
        });

        const newEntry = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(after),
        });
        expect(newEntry).toMatchObject({
            status: 'active',
            citedCount: 1,
            successorSlug: null,
        });
    });

    test('an empty file tombstones every row and a revert brings it back with telemetry intact', async () => {
        const original = entry('order-routing', 'Route orders through fct.');
        await model.replaceEntriesForProject(PROJECT_UUID, [original]);
        await model.incrementCitedForEntries({
            projectUuid: PROJECT_UUID,
            slugs: [slugOf(original)],
        });

        await model.replaceEntriesForProject(PROJECT_UUID, []);
        expect(await model.getActiveEntries(PROJECT_UUID)).toEqual([]);
        expect(await rowsForProject()).toHaveLength(1);

        await model.replaceEntriesForProject(PROJECT_UUID, [original]);
        const revived = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(original),
        });
        expect(revived).toMatchObject({ status: 'active', citedCount: 1 });
        expect(await rowsForProject()).toHaveLength(1);
    });

    test('resolves on the hash suffix after the file id is renamed', async () => {
        const original = entry('old-name', 'A durable fact.');
        await model.replaceEntriesForProject(PROJECT_UUID, [original]);

        const renamed = entry('brand-new-name', 'A durable fact.');
        await model.replaceEntriesForProject(PROJECT_UUID, [renamed]);

        // Same content, so the same row — reached through either slug.
        expect(await rowsForProject()).toHaveLength(1);
        const viaOldSlug = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(original),
        });
        expect(viaOldSlug).toMatchObject({
            id: 'brand-new-name',
            status: 'active',
        });
    });

    test('unknown and malformed slugs resolve to nothing', async () => {
        await expect(
            model.findEntryBySlug({
                projectUuid: PROJECT_UUID,
                slug: 'never-ingested-00000000',
            }),
        ).resolves.toBeUndefined();
        await expect(
            model.findEntryBySlug({
                projectUuid: PROJECT_UUID,
                slug: 'not-a-slug',
            }),
        ).resolves.toBeUndefined();
    });

    test('citation telemetry counts a removed entry', async () => {
        const removed = entry('gone', 'This entry will be deleted.');
        await model.replaceEntriesForProject(PROJECT_UUID, [removed]);
        await model.replaceEntriesForProject(PROJECT_UUID, []);

        const cited = await model.incrementCitedForEntries({
            projectUuid: PROJECT_UUID,
            slugs: [slugOf(removed)],
        });
        expect(cited.map(({ slug }) => slug)).toEqual([slugOf(removed)]);

        const detail = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(removed),
        });
        expect(detail).toMatchObject({ status: 'removed', citedCount: 1 });
    });

    test('citing an unknown slug bumps nothing', async () => {
        const present = entry('kept', 'A kept fact.');
        await model.replaceEntriesForProject(PROJECT_UUID, [present]);

        const cited = await model.incrementCitedForEntries({
            projectUuid: PROJECT_UUID,
            slugs: ['something-else-00000000', 'not-a-slug'],
        });
        expect(cited).toEqual([]);

        const untouched = await model.findEntryBySlug({
            projectUuid: PROJECT_UUID,
            slug: slugOf(present),
        });
        expect(untouched).toMatchObject({ citedCount: 0 });
    });

    test('getDocument returns the file view without row identity', async () => {
        const entries = [entry('a', 'First fact.'), entry('b', 'Second fact.')];
        await model.replaceEntriesForProject(PROJECT_UUID, entries);

        const document = await model.getDocument(PROJECT_UUID);
        expect(document).toEqual(entries);
        expect(document.every((e) => !('slug' in e))).toBe(true);
    });
});
