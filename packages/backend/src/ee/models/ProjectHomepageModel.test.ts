import {
    ConflictError,
    NotFoundError,
    type HomepageConfig,
} from '@lightdash/common';
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
    allow_personal: true,
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
        const baseUpdatedAt = new Date('2026-01-02T00:00:00Z');

        it('throws NotFoundError when the homepage does not exist', async () => {
            tracker.on.update(HomepagesTableName).responseOnce([]);
            tracker.on.select(HomepagesTableName).responseOnce([]);

            await expect(
                model.updateDraft(HOMEPAGE_UUID, {
                    draftConfig,
                    baseUpdatedAt,
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it('throws ConflictError when the base timestamp is stale', async () => {
            tracker.on.update(HomepagesTableName).responseOnce([]);
            tracker.on
                .select(HomepagesTableName)
                .responseOnce([makeDbHomepage()]);

            await expect(
                model.updateDraft(HOMEPAGE_UUID, {
                    draftConfig,
                    baseUpdatedAt,
                }),
            ).rejects.toThrow(ConflictError);
        });

        it('includes the compare-and-set condition in the update', async () => {
            tracker.on
                .update(HomepagesTableName)
                .responseOnce([makeDbHomepage()]);

            await model.updateDraft(HOMEPAGE_UUID, {
                draftConfig,
                baseUpdatedAt,
            });

            const updateQuery = tracker.history.update[0];
            expect(updateQuery.sql).toContain('updated_at');
            expect(updateQuery.bindings).toContainEqual(baseUpdatedAt);
        });
    });

    describe('publish', () => {
        it('throws NotFoundError when homepage does not exist', async () => {
            tracker.on.select(HomepagesTableName).responseOnce([]);

            await expect(
                model.publish(HOMEPAGE_UUID, { type: 'everyone' }, true),
            ).rejects.toThrow(NotFoundError);
        });

        it('publishing to everyone copies the draft and promotes to default', async () => {
            tracker.on
                .select(HomepagesTableName)
                .responseOnce([makeDbHomepage()]);
            // first update unsets the previous default, second publishes
            tracker.on.update(HomepagesTableName).responseOnce(1);
            tracker.on
                .update(HomepagesTableName)
                .responseOnce([
                    makeDbHomepage({ published_config: draftConfig }),
                ]);

            const result = await model.publish(
                HOMEPAGE_UUID,
                { type: 'everyone' },
                true,
            );

            expect(tracker.history.update).toHaveLength(2);
            const unsetQuery = tracker.history.update[0];
            expect(unsetQuery.sql).toContain('is_default');
            const publishQuery = tracker.history.update[1];
            expect(publishQuery.bindings).toContainEqual(draftConfig);
            expect(result.publishedConfig).toEqual(draftConfig);
        });

        it('publishing to groups replaces assignments without touching the default', async () => {
            tracker.on
                .select(HomepagesTableName)
                .responseOnce([makeDbHomepage({ is_default: false })]);
            tracker.on.update(HomepagesTableName).responseOnce([
                makeDbHomepage({
                    is_default: false,
                    published_config: draftConfig,
                }),
            ]);
            tracker.on.delete('homepage_assignments').responseOnce(1);
            tracker.on
                .select('homepage_assignments')
                .responseOnce([{ max: 1 }]);
            tracker.on.insert('homepage_assignments').responseOnce([]);

            const result = await model.publish(
                HOMEPAGE_UUID,
                { type: 'groups', groupUuids: ['group-a', 'group-b'] },
                true,
            );

            // publish update must not set is_default for group audiences
            const publishQuery = tracker.history.update[0];
            expect(publishQuery.sql).not.toContain('is_default');
            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.bindings).toContainEqual('group-a');
            expect(insertQuery.bindings).toContainEqual('group-b');
            expect(result.isDefault).toBe(false);
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
