import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    AiReviewNotificationLogTableName,
    AiReviewNotificationSettingsTableName,
} from '../database/entities/aiReviewNotifications';
import { AiAgentReviewNotificationModel } from './AiAgentReviewNotificationModel';

describe('AiAgentReviewNotificationModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiAgentReviewNotificationModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('returns disabled settings defaults when no row exists', async () => {
        tracker.on.select(AiReviewNotificationSettingsTableName).response([]);

        await expect(model.getSettings('org-1')).resolves.toEqual({
            organizationUuid: 'org-1',
            enabled: false,
            slackChannelId: null,
        });
    });

    it('records sent notifications and returns the log uuid', async () => {
        tracker.on
            .insert(AiReviewNotificationLogTableName)
            .response([{ notification_log_uuid: 'log-1' }]);

        await expect(
            model.recordSent({
                organizationUuid: 'org-1',
                fingerprint: 'fingerprint-1',
                recipientUserUuid: 'user-1',
                channel: AiReviewNotificationChannel.Bell,
                event: AiReviewNotificationEvent.Assigned,
            }),
        ).resolves.toBe('log-1');

        expect(tracker.history.insert[0].bindings).toContain(
            AiReviewNotificationStatus.Sent,
        );
    });
});
