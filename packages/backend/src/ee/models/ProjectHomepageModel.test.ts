import { NotFoundError, type HomepageConfig } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { HomepagesTableName } from '../database/entities/projectHomepages';
import { ProjectHomepageModel } from './ProjectHomepageModel';

// Covers only behavior beyond a thin Knex wrapper: NotFoundError
// contracts and the publish draft→published copy the service depends on.

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';
const HOMEPAGE_UUID = '00000000-0000-0000-0000-000000000010';

const draftConfig: HomepageConfig = {
    version: 1,
    rows: [
        {
            id: 'row-1',
            blocks: [
                { id: 'block-1', type: 'markdown', config: { content: 'hi' } },
            ],
        },
    ],
};

const makeDbHomepage = (overrides: Partial<Record<string, unknown>> = {}) => ({
    homepage_uuid: HOMEPAGE_UUID,
    project_uuid: PROJECT_UUID,
    name: 'Team homepage',
    draft_config: draftConfig,
    published_config: null,
    is_default: true,
    created_by_user_uuid: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
});

describe('ProjectHomepageModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ProjectHomepageModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('updateDraft', () => {
        it('throws NotFoundError when no row is updated', async () => {
            tracker.on.update(HomepagesTableName).responseOnce([]);

            await expect(
                model.updateDraft(HOMEPAGE_UUID, { draftConfig }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('publish', () => {
        it('throws NotFoundError when homepage does not exist', async () => {
            tracker.on.select(HomepagesTableName).responseOnce([]);

            await expect(model.publish(HOMEPAGE_UUID)).rejects.toThrow(
                NotFoundError,
            );
        });

        it('copies the draft config into published_config', async () => {
            tracker.on
                .select(HomepagesTableName)
                .responseOnce([makeDbHomepage()]);
            tracker.on
                .update(HomepagesTableName)
                .responseOnce([
                    makeDbHomepage({ published_config: draftConfig }),
                ]);

            const result = await model.publish(HOMEPAGE_UUID);

            const updateQuery = tracker.history.update[0];
            expect(updateQuery.bindings).toContainEqual(draftConfig);
            expect(result.publishedConfig).toEqual(draftConfig);
        });
    });

    describe('getPublishedDefault', () => {
        it('returns undefined when nothing is published', async () => {
            tracker.on.select(HomepagesTableName).responseOnce([]);

            await expect(
                model.getPublishedDefault(PROJECT_UUID),
            ).resolves.toBeUndefined();
        });
    });
});
