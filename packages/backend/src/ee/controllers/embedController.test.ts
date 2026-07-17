import {
    ForbiddenError,
    SchedulerFormat,
    type Account,
    type SessionUser,
} from '@lightdash/common';
import express from 'express';
import { EmbedController } from './embedController';

const embedWriteUser = {
    userUuid: 'embed-write-user-uuid',
} as SessionUser;

const buildRequest = (
    recipients: string[],
    writeUser: SessionUser = embedWriteUser,
) =>
    ({
        account: {
            isJwtUser: () => true,
            authentication: {
                type: 'jwt',
                data: {
                    content: {
                        type: 'dashboard',
                        projectUuid: 'project-uuid',
                        dashboardUuid: 'dashboard-uuid',
                        scheduledDeliveryRecipients: recipients,
                    },
                    writeActions: {
                        userUuid: writeUser.userUuid,
                        spaceUuid: 'space-uuid',
                    },
                },
            },
            access: {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-uuid',
                    chartUuids: [],
                    explores: [],
                },
            },
            embedWriteUser: writeUser,
        } as unknown as Account,
    }) as express.Request;

describe('EmbedController scheduled deliveries', () => {
    const sendScheduler = vi.fn().mockResolvedValue({ jobId: 'job-uuid' });
    const controller = new EmbedController({
        getSchedulerService: () => ({ sendScheduler }),
    } as unknown as ConstructorParameters<typeof EmbedController>[0]);
    controller.setStatus = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queues an image delivery to a recipient allowed by the embed token', async () => {
        const result = await controller.sendEmbedDashboardDelivery(
            buildRequest(['viewer@example.com']),
            'project-uuid',
            { recipient: 'viewer@example.com' },
        );

        expect(sendScheduler).toHaveBeenCalledWith(
            embedWriteUser,
            expect.objectContaining({
                dashboardUuid: 'dashboard-uuid',
                enabled: true,
                format: SchedulerFormat.IMAGE,
                includeLinks: false,
                targets: [{ recipient: 'viewer@example.com' }],
            }),
        );
        expect(result.results.jobId).toBe('job-uuid');
    });

    it('rejects recipients that are not in the embed token', async () => {
        await expect(
            controller.sendEmbedDashboardDelivery(
                buildRequest(['viewer@example.com']),
                'project-uuid',
                { recipient: 'other@example.com' },
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(sendScheduler).not.toHaveBeenCalled();
    });

    it('rejects service account actors that cannot render through browser sessions', async () => {
        await expect(
            controller.sendEmbedDashboardDelivery(
                buildRequest(['viewer@example.com'], {
                    ...embedWriteUser,
                    serviceAccount: {
                        uuid: 'service-account-uuid',
                        description: 'Embed actions',
                    },
                }),
                'project-uuid',
                { recipient: 'viewer@example.com' },
            ),
        ).rejects.toThrow('Dashboard deliveries require writeActions.userUuid');
        expect(sendScheduler).not.toHaveBeenCalled();
    });
});
