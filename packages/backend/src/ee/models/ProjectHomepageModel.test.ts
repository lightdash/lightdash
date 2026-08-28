import {
    ConflictError,
    NotFoundError,
    type HomepageConfig,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import {
    AnnouncementsTableName,
    HomepageAssignmentsTableName,
    HomepagesTableName,
} from '../database/entities/projectHomepages';
import {
    ProjectHomepageModel,
    rankGroupPriorities,
} from './ProjectHomepageModel';

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
                model.publish(HOMEPAGE_UUID, { type: 'everyone' }),
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

            const result = await model.publish(HOMEPAGE_UUID, {
                type: 'everyone',
            });

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

            const result = await model.publish(HOMEPAGE_UUID, {
                type: 'groups',
                groupUuids: ['group-a', 'group-b'],
            });

            // publish update must not set is_default for group audiences
            const publishQuery = tracker.history.update[0];
            expect(publishQuery.sql).not.toContain('is_default');
            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.bindings).toContainEqual('group-a');
            expect(insertQuery.bindings).toContainEqual('group-b');
            expect(result.isDefault).toBe(false);
        });
    });

    describe('publishProjectDraftAnnouncements', () => {
        const makeDbAnnouncement = (
            overrides: Partial<Record<string, unknown>> = {},
        ) => ({
            announcement_uuid: 'ann-1',
            project_uuid: PROJECT_UUID,
            title: 'Launch',
            body: null,
            category: null,
            pinned: false,
            created_by_user_uuid: null,
            created_at: new Date('2026-01-01T00:00:00Z'),
            updated_at: new Date('2026-01-01T00:00:00Z'),
            published_at: new Date('2026-01-03T00:00:00Z'),
            pending_slack_channel_id: null,
            ...overrides,
        });

        it('locks the drafts and only publishes rows still unpublished', async () => {
            tracker.on.select(AnnouncementsTableName).responseOnce([
                {
                    announcement_uuid: 'ann-1',
                    pending_slack_channel_id: 'C1',
                },
            ]);
            tracker.on
                .update(AnnouncementsTableName)
                .responseOnce([makeDbAnnouncement()]);

            const result =
                await model.publishProjectDraftAnnouncements(PROJECT_UUID);

            const selectQuery = tracker.history.select[0];
            expect(selectQuery.sql.toLowerCase()).toContain(
                'for update skip locked',
            );
            const updateQuery = tracker.history.update[0];
            expect(updateQuery.sql.toLowerCase()).toContain(
                'published_at" is null',
            );
            expect(result).toEqual([
                {
                    announcement: expect.objectContaining({
                        announcementUuid: 'ann-1',
                        published: true,
                    }),
                    slackChannelId: 'C1',
                },
            ]);
        });

        it('returns nothing when another publisher already claimed the drafts', async () => {
            tracker.on.select(AnnouncementsTableName).responseOnce([
                {
                    announcement_uuid: 'ann-1',
                    pending_slack_channel_id: 'C1',
                },
            ]);
            tracker.on.update(AnnouncementsTableName).responseOnce([]);

            await expect(
                model.publishProjectDraftAnnouncements(PROJECT_UUID),
            ).resolves.toEqual([]);
        });
    });

    describe('getRecentlyViewed', () => {
        const USER_UUID = '00000000-0000-0000-0000-000000000020';

        it('returns no items when the query hits the statement timeout', async () => {
            const timeout = new DatabaseError(
                'canceling statement due to statement timeout',
                0,
                'error',
            );
            timeout.code = '57014';
            tracker.on.any(/statement_timeout/).responseOnce([]);
            tracker.on.any(/analytics_chart_views/).simulateErrorOnce(timeout);

            await expect(
                model.getRecentlyViewed(PROJECT_UUID, USER_UUID),
            ).resolves.toEqual([]);
        });

        it('rethrows other database errors', async () => {
            tracker.on.any(/statement_timeout/).responseOnce([]);
            tracker.on
                .any(/analytics_chart_views/)
                .simulateErrorOnce(new Error('connection reset'));

            await expect(
                model.getRecentlyViewed(PROJECT_UUID, USER_UUID),
            ).rejects.toThrow('connection reset');
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

    describe('resolvePublished', () => {
        it('breaks group-priority ties by created_at then assignment_uuid', async () => {
            tracker.on.select(HomepageAssignmentsTableName).responseOnce([]);
            tracker.on.select(HomepagesTableName).responseOnce([]);

            await model.resolvePublished(PROJECT_UUID, {
                groupUuids: ['group-a', 'group-b'],
                role: undefined,
            });

            const selectQuery = tracker.history.select[0];
            expect(selectQuery.sql).toContain('priority');
            expect(selectQuery.sql).toContain('created_at');
            expect(selectQuery.sql).toContain('assignment_uuid');
        });
    });
});

describe('rankGroupPriorities', () => {
    const assignment = (
        groupUuid: string,
        priority: number,
        createdAt: string,
        assignmentUuid: string,
    ) => ({
        groupUuid,
        priority,
        createdAt: new Date(createdAt),
        assignmentUuid,
    });

    it('assigns unique sequential priorities to the full project set', () => {
        const ranked = rankGroupPriorities(
            [
                assignment('group-a', 0, '2026-01-01T00:00:00Z', 'aaa'),
                assignment('group-b', 0, '2026-01-02T00:00:00Z', 'bbb'),
                assignment('group-c', 1, '2026-01-03T00:00:00Z', 'ccc'),
            ],
            ['group-c'],
        );

        expect(ranked).toEqual([
            { groupUuid: 'group-c', priority: 0 },
            { groupUuid: 'group-a', priority: 1 },
            { groupUuid: 'group-b', priority: 2 },
        ]);
    });

    it('honors the requested order and appends omitted groups', () => {
        const ranked = rankGroupPriorities(
            [
                assignment('group-a', 2, '2026-01-01T00:00:00Z', 'aaa'),
                assignment('group-b', 0, '2026-01-01T00:00:00Z', 'bbb'),
                assignment('group-c', 1, '2026-01-01T00:00:00Z', 'ccc'),
            ],
            ['group-c', 'group-a'],
        );

        expect(ranked.map((row) => row.groupUuid)).toEqual([
            'group-c',
            'group-a',
            'group-b',
        ]);
        expect(ranked.map((row) => row.priority)).toEqual([0, 1, 2]);
    });

    it('breaks remaining ties by created_at then assignment uuid', () => {
        const ranked = rankGroupPriorities(
            [
                assignment('group-z', 3, '2026-01-01T00:00:00Z', 'zzz'),
                assignment('group-a', 3, '2026-01-01T00:00:00Z', 'aaa'),
                assignment('group-m', 3, '2026-01-02T00:00:00Z', 'mmm'),
            ],
            [],
        );

        expect(ranked.map((row) => row.groupUuid)).toEqual([
            'group-a',
            'group-z',
            'group-m',
        ]);
    });

    it('ignores unknown and duplicate requested group uuids', () => {
        const ranked = rankGroupPriorities(
            [assignment('group-a', 0, '2026-01-01T00:00:00Z', 'aaa')],
            ['missing', 'group-a', 'group-a'],
        );

        expect(ranked).toEqual([{ groupUuid: 'group-a', priority: 0 }]);
    });
});
