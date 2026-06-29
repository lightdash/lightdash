import {
    AiReviewNotificationEvent,
    EE_SCHEDULER_TASKS,
    OrganizationMemberRole,
} from '@lightdash/common';
import { AiAgentReviewNotificationService } from './AiAgentReviewNotificationService';

const makeService = () => {
    const notificationsModel = {
        createAiReviewNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        scheduleTask: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };
    const aiAgentReviewClassifierModel = {
        getReviewItem: vi.fn().mockResolvedValue({
            fingerprint: 'fingerprint-1',
            title: 'Missing metric',
            primaryRootCause: 'semantic_layer',
        }),
    };
    const organizationMemberProfileModel = {
        getOrganizationMembers: vi.fn().mockResolvedValue({
            data: [
                {
                    userUuid: 'developer-1',
                    email: 'dev@example.com',
                    role: OrganizationMemberRole.DEVELOPER,
                    organizationUuid: 'org-1',
                    ability: undefined,
                },
                {
                    userUuid: 'viewer-1',
                    email: 'viewer@example.com',
                    role: OrganizationMemberRole.VIEWER,
                    organizationUuid: 'org-1',
                    ability: undefined,
                },
            ],
        }),
    };
    const service = new AiAgentReviewNotificationService({
        notificationsModel,
        schedulerClient,
        aiAgentReviewClassifierModel,
        organizationMemberProfileModel,
    } as unknown as ConstructorParameters<
        typeof AiAgentReviewNotificationService
    >[0]);

    return {
        service,
        notificationsModel,
        schedulerClient,
        aiAgentReviewClassifierModel,
        organizationMemberProfileModel,
    };
};

describe('AiAgentReviewNotificationService', () => {
    it('filters recipients to members who can manage AiAgent', async () => {
        const { service } = makeService();

        await expect(service.getRecipients('org-1')).resolves.toEqual([
            { userUuid: 'developer-1', email: 'dev@example.com' },
        ]);
    });

    it('suppresses self-assignment notifications', async () => {
        const { service, notificationsModel, schedulerClient } = makeService();

        await service.notifyAssigned({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            fingerprint: 'fingerprint-1',
            assigneeUserUuid: 'user-1',
            actorUserUuid: 'user-1',
        });

        expect(
            notificationsModel.createAiReviewNotifications,
        ).not.toHaveBeenCalled();
        expect(schedulerClient.scheduleTask).not.toHaveBeenCalled();
    });

    it('writes bell and enqueues task for different assignee', async () => {
        const { service, notificationsModel, schedulerClient } = makeService();

        await service.notifyAssigned({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            fingerprint: 'fingerprint-1',
            assigneeUserUuid: 'user-2',
            actorUserUuid: 'user-1',
        });

        expect(
            notificationsModel.createAiReviewNotifications,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                recipients: [{ userUuid: 'user-2' }],
                metadata: expect.objectContaining({
                    event: AiReviewNotificationEvent.Assigned,
                    fingerprint: 'fingerprint-1',
                }),
            }),
        );
        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION,
            expect.objectContaining({
                event: AiReviewNotificationEvent.Assigned,
                assigneeUserUuid: 'user-2',
            }),
        );
    });
});
