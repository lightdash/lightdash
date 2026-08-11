import { type ProjectContextEntry } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { ProjectContextEntriesTableName } from '../database/entities/projectContext';
import { ProjectContextModel } from './ProjectContextModel';

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';

describe('ProjectContextModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ProjectContextModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('reconcile serializes terms/objects to JSON strings so pg writes valid jsonb', async () => {
        const entries: ProjectContextEntry[] = [
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ];

        tracker.on.select(ProjectContextEntriesTableName).responseOnce([]);
        tracker.on.insert(ProjectContextEntriesTableName).responseOnce([]);

        await model.reconcileEntriesForProject(PROJECT_UUID, entries);

        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toEqual(
            expect.arrayContaining([
                PROJECT_UUID,
                JSON.stringify(['HR']),
                JSON.stringify([]),
            ]),
        );
        // A raw JS array binding is what pg turns into an array literal and
        // rejects for jsonb, so it must NOT be passed through unstringified.
        expect(tracker.history.insert[0].bindings).not.toContainEqual(['HR']);
    });

    test('an empty entries array tombstones the active rows', async () => {
        tracker.on.select(ProjectContextEntriesTableName).responseOnce([
            {
                hash: 'a'.repeat(64),
                status: 'active',
                entry_id: 'hr',
                content: '"HR" = high-risk cohort.',
                title: null,
                apply: null,
                terms: ['HR'],
                objects: [],
            },
        ]);
        tracker.on.update(ProjectContextEntriesTableName).responseOnce(1);

        await model.reconcileEntriesForProject(PROJECT_UUID, []);

        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0].bindings).toEqual(
            expect.arrayContaining(['removed']),
        );
    });
});
