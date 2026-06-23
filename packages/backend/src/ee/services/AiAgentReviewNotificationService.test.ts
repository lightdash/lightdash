import {
    AiReviewNotificationEvent,
    OrganizationMemberRole,
} from '@lightdash/common';
import { AiAgentReviewNotificationService } from './AiAgentReviewNotificationService';

const makeService = () => {
    const notificationsModel = {
        createAiReviewNotifications: jest.fn().mockResolvedValue(undefined),
    };
    const aiAgentReviewClassifierModel = {
        getReviewItem: jest.fn().mockResolvedValue({
            fingerprint: 'fingerprint-1',
            title: 'Missing metric',
            primaryRootCause: 'semantic_layer',
        }),
    };
    const organizationMemberProfileModel = {
        getOrganizationMembers: jest.fn().mockResolvedValue({
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
        aiAgentReviewClassifierModel,
        organizationMemberProfileModel,
    } as unknown as ConstructorParameters<
        typeof AiAgentReviewNotificationService
    >[0]);

    return {
        service,
        notificationsModel,
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
        const { service, notificationsModel } = makeService();

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
    });

    it('writes a bell notification for a different assignee', async () => {
        const { service, notificationsModel } = makeService();

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
    });
});
