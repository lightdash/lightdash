import { type UUID } from '@lightdash/common';
import { type Request } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type MobilePushNotificationService } from '../services/MobilePushNotificationService/MobilePushNotificationService';
import { MobilePushNotificationController } from './mobilePushNotificationController';

describe('MobilePushNotificationController.registerLiveActivityPushToStartToken', () => {
    it('forwards the authenticated account and never returns the token', async () => {
        const registerPushToStartToken = vi.fn<
            MobilePushNotificationService['registerPushToStartToken']
        >(async () => undefined);
        const services = {
            getMobilePushNotificationService: () => ({
                registerPushToStartToken,
            }),
        } as unknown as ServiceRepository;
        const controller = new MobilePushNotificationController(services);
        const request = {
            account: {
                user: {
                    type: 'registered',
                    id: 'user-uuid',
                    userUuid: 'user-uuid',
                },
                organization: {
                    organizationUuid: 'organization-uuid',
                    name: 'Organization',
                    createdAt: new Date('2026-08-31T12:00:00.000Z'),
                },
                authentication: { type: 'session' },
            },
        } as unknown as Request;
        const installationUuid = '10000000-0000-4000-8000-000000000003' as UUID;

        const response = await controller.registerLiveActivityPushToStartToken(
            request,
            installationUuid,
            { pushToken: 'push-to-start-token' },
        );

        expect(registerPushToStartToken).toHaveBeenCalledWith({
            user: expect.objectContaining({
                userUuid: 'user-uuid',
                organizationUuid: 'organization-uuid',
            }),
            installationUuid,
            pushToken: 'push-to-start-token',
        });
        expect(response).toEqual({ status: 'ok', results: undefined });
        expect(JSON.stringify(response)).not.toContain('push-to-start-token');
    });
});
