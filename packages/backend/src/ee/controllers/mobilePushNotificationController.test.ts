import { type UUID } from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import { type Request } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
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

describe('MobilePushNotificationController.revokeInstallation', () => {
    it('keeps installation registration and token updates authenticated', () => {
        expect(
            fetchMiddlewares(
                MobilePushNotificationController.prototype.registerInstallation,
            ),
        ).toEqual([[allowApiKeyAuthentication, isAuthenticated]]);
        expect(
            fetchMiddlewares(
                MobilePushNotificationController.prototype
                    .registerLiveActivityPushToStartToken,
            ),
        ).toEqual([[allowApiKeyAuthentication, isAuthenticated]]);
    });

    it('allows an unauthenticated caller to revoke an installation', async () => {
        const revokeInstallation = vi.fn<
            MobilePushNotificationService['revokeInstallation']
        >(async () => undefined);
        const services = {
            getMobilePushNotificationService: () => ({
                revokeInstallation,
            }),
        } as unknown as ServiceRepository;
        const controller = new MobilePushNotificationController(services);
        const installationUuid = '10000000-0000-4000-8000-000000000003' as UUID;

        expect(
            fetchMiddlewares(
                MobilePushNotificationController.prototype.revokeInstallation,
            ),
        ).toEqual([]);
        const response = await controller.revokeInstallation(
            {} as Request,
            installationUuid,
        );

        expect(revokeInstallation).toHaveBeenCalledWith({ installationUuid });
        expect(response).toEqual({ status: 'ok', results: undefined });
    });
});
