import {
    PROJECT_CONTEXT_FILE_VERSION,
    type ProjectContextEntry,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { ProjectContextDocumentTableName } from '../database/entities/projectContext';
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

    test('stores entries as JSONB data instead of a JSON string', async () => {
        const entries: ProjectContextEntry[] = [
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ];

        tracker.on.insert(ProjectContextDocumentTableName).responseOnce([]);

        await model.replaceEntriesForProject(PROJECT_UUID, entries);

        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toEqual(
            expect.arrayContaining([
                PROJECT_UUID,
                PROJECT_CONTEXT_FILE_VERSION,
                entries,
            ]),
        );
        expect(tracker.history.insert[0].bindings).not.toContain(
            JSON.stringify(entries),
        );
    });
});
