import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    resolveAiReviewJiraDestination,
    resolveAiReviewLinearDestination,
} from './aiReviewNotification';

test('event and channel enums expose stable string values', () => {
    expect(AiReviewNotificationEvent.NeedsReview).toBe('needs_review');
    expect(AiReviewNotificationChannel.SlackDm).toBe('slack_dm');
});

describe('resolveAiReviewJiraDestination', () => {
    const settings = {
        jiraEnabled: true,
        jiraProjectId: 'jira-project-1',
        jiraIssueTypeId: 'type-1',
    };

    it('uses organization routing for all projects', () => {
        expect(
            resolveAiReviewJiraDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                applyToAllProjects: true,
                settings,
                destination: null,
                hasProjectDestinations: false,
            }),
        ).toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            enabled: true,
            jiraProjectId: 'jira-project-1',
            jiraIssueTypeId: 'type-1',
        });
    });

    it('disables unselected projects', () => {
        expect(
            resolveAiReviewJiraDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-2',
                applyToAllProjects: false,
                settings,
                destination: null,
                hasProjectDestinations: true,
            }),
        ).toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-2',
            enabled: false,
            jiraProjectId: null,
            jiraIssueTypeId: null,
        });
    });
});

describe('resolveAiReviewLinearDestination', () => {
    const settings = {
        linearEnabled: true,
        linearTeamId: 'team-1',
        linearProjectId: 'linear-project-1',
    };
    const destination = {
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        enabled: true,
        linearTeamId: 'team-2',
        linearProjectId: 'linear-project-2',
    };

    it('uses org routing when every project is in scope', () => {
        expect(
            resolveAiReviewLinearDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                applyToAllProjects: true,
                settings,
                destination,
                hasProjectDestinations: true,
            }),
        ).toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: 'linear-project-1',
        });
    });

    it('uses the saved project destination when scope is selected projects', () => {
        expect(
            resolveAiReviewLinearDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                applyToAllProjects: false,
                settings,
                destination,
                hasProjectDestinations: true,
            }),
        ).toEqual(destination);
    });

    it('does not fall back to org routing for unselected projects', () => {
        expect(
            resolveAiReviewLinearDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-2',
                applyToAllProjects: false,
                settings,
                destination: null,
                hasProjectDestinations: true,
            }),
        ).toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-2',
            enabled: false,
            linearTeamId: null,
            linearProjectId: null,
        });
    });

    it('keeps legacy org routing when no project destinations exist', () => {
        expect(
            resolveAiReviewLinearDestination({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                applyToAllProjects: false,
                settings,
                destination: null,
                hasProjectDestinations: false,
            }),
        ).toEqual({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: 'linear-project-1',
        });
    });
});
