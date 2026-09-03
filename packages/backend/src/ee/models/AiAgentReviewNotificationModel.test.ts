import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    AiReviewLinearDestinationTableName,
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
            linearEnabled: false,
            linearTeamId: null,
            linearProjectId: null,
            jiraEnabled: false,
            jiraProjectId: null,
            jiraIssueTypeId: null,
        });
    });

    it('uses legacy org routing until a project destination is saved', async () => {
        tracker.on.select(AiReviewNotificationSettingsTableName).response([
            {
                organization_uuid: 'org-1',
                enabled: false,
                slack_channel_id: null,
                linear_enabled: true,
                linear_team_id: 'team-1',
                linear_project_id: 'linear-project-1',
                linear_apply_to_all_projects: false,
            },
        ]);
        tracker.on.select(AiReviewLinearDestinationTableName).response([]);

        await expect(
            model.getLinearDestination('org-1', 'project-1'),
        ).resolves.toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: 'linear-project-1',
        });
    });

    it('uses org routing for every project when apply-to-all is enabled', async () => {
        tracker.on.select(AiReviewNotificationSettingsTableName).response([
            {
                organization_uuid: 'org-1',
                enabled: false,
                slack_channel_id: null,
                linear_enabled: true,
                linear_team_id: 'team-1',
                linear_project_id: 'linear-project-1',
                linear_apply_to_all_projects: true,
            },
        ]);
        tracker.on.select(AiReviewLinearDestinationTableName).response([]);

        await expect(
            model.getLinearDestination('org-1', 'project-2'),
        ).resolves.toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-2',
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: 'linear-project-1',
        });
    });

    it('returns selected-project routing from saved destinations', async () => {
        tracker.on.select(AiReviewNotificationSettingsTableName).response([
            {
                organization_uuid: 'org-1',
                enabled: false,
                slack_channel_id: null,
                linear_enabled: true,
                linear_team_id: 'team-1',
                linear_project_id: 'linear-project-1',
                linear_apply_to_all_projects: false,
            },
        ]);
        tracker.on.select(AiReviewLinearDestinationTableName).response([
            {
                organization_uuid: 'org-1',
                project_uuid: 'project-1',
                enabled: true,
                linear_team_id: 'team-2',
                linear_project_id: 'linear-project-2',
            },
        ]);

        await expect(model.getLinearRouting('org-1')).resolves.toEqual({
            organizationUuid: 'org-1',
            applyToAllProjects: false,
            projectUuids: ['project-1'],
            enabled: true,
            linearTeamId: 'team-2',
            linearProjectId: 'linear-project-2',
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
