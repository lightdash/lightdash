import {
    AiReviewNotificationEvent,
    ApiNotificationResourceType,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    DbNotificationResourceType,
    NotificationsTableName,
} from '../../database/entities/notifications';
import { NotificationsModel } from './NotificationsModel';

describe('NotificationsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new NotificationsModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('only updates allowed notification fields', async () => {
        tracker.on.update(NotificationsTableName).responseOnce(1);

        await model.updateNotification('notification-uuid', {
            viewed: true,
            user_uuid: 'attacker-user-uuid',
        } as unknown as Parameters<
            NotificationsModel['updateNotification']
        >[1]);

        const [query] = tracker.history.update;
        expect(query.sql).toContain(NotificationsTableName);
        expect(query.sql).toContain('viewed');
        expect(query.sql).not.toContain('user_uuid');
        expect(query.bindings).not.toContain('attacker-user-uuid');
    });

    it('creates one AI review notification per recipient', async () => {
        tracker.on.insert(NotificationsTableName).response([]);
        tracker.on.insert(NotificationsTableName).response([]);

        await model.createAiReviewNotifications({
            recipients: [{ userUuid: 'user-1' }, { userUuid: 'user-2' }],
            metadata: {
                fingerprint: 'fingerprint-1',
                event: AiReviewNotificationEvent.NeedsReview,
                title: 'Missing metric',
                rootCause: 'semantic_layer',
                projectUuid: 'project-1',
                count: 3,
                searchParams: 'reviewItemUuid=fingerprint-1',
            },
            message: '3 AI context findings need review',
            url: '/ai-agents/admin/reviews?reviewItemUuid=fingerprint-1',
        });

        expect(tracker.history.insert).toHaveLength(2);
        expect(tracker.history.insert[0].bindings).toContain(
            DbNotificationResourceType.AiReviewItem,
        );
        expect(tracker.history.insert[0].bindings).toContain('user-1');
        expect(tracker.history.insert[1].bindings).toContain('user-2');
    });

    it('maps AI review notification rows', async () => {
        tracker.on.select(NotificationsTableName).response([
            {
                notification_id: 'notification-1',
                resource_type: DbNotificationResourceType.AiReviewItem,
                message: 'Missing metric needs review',
                url: '/ai-agents/admin/reviews?reviewItemUuid=fingerprint-1',
                viewed: false,
                created_at: new Date('2026-06-23T10:00:00.000Z'),
                resource_uuid: 'fingerprint-1',
                metadata: {
                    fingerprint: 'fingerprint-1',
                    event: AiReviewNotificationEvent.Assigned,
                    title: 'Missing metric',
                    rootCause: 'semantic_layer',
                    projectUuid: 'project-1',
                    count: 1,
                    searchParams: 'reviewItemUuid=fingerprint-1',
                },
            },
        ]);

        await expect(model.getAiReviewNotifications('user-1')).resolves.toEqual(
            [
                {
                    notificationId: 'notification-1',
                    resourceType: ApiNotificationResourceType.AiReview,
                    message: 'Missing metric needs review',
                    url: '/ai-agents/admin/reviews?reviewItemUuid=fingerprint-1',
                    viewed: false,
                    createdAt: new Date('2026-06-23T10:00:00.000Z'),
                    resourceUuid: 'fingerprint-1',
                    metadata: {
                        fingerprint: 'fingerprint-1',
                        event: AiReviewNotificationEvent.Assigned,
                        title: 'Missing metric',
                        rootCause: 'semantic_layer',
                        projectUuid: 'project-1',
                        count: 1,
                        searchParams: 'reviewItemUuid=fingerprint-1',
                    },
                },
            ],
        );
    });
});
