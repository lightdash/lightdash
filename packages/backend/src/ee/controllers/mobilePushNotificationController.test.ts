import { type UUID } from '@lightdash/common';
import {
    ExpressTemplateService,
    ValidateError,
    type TsoaRoute,
} from '@tsoa/runtime';
import { type Request, type Response } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type MobilePushNotificationService } from '../services/MobilePushNotificationService/MobilePushNotificationService';
import { MobilePushNotificationController } from './mobilePushNotificationController';

const uuidPathParamModels: TsoaRoute.Models = {
    UUID: {
        dataType: 'refAlias',
        type: {
            dataType: 'string',
            validators: {
                pattern: {
                    value: '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}',
                },
            },
        },
    },
};

const installationUuidPathArgs: Record<string, TsoaRoute.ParameterSchema> = {
    installationUuid: {
        in: 'path',
        name: 'installationUuid',
        required: true,
        ref: 'UUID',
    },
};

const templateService = new ExpressTemplateService(uuidPathParamModels, {
    noImplicitAdditionalProperties: 'ignore',
    bodyCoercion: true,
});

const validateInstallationUuidPath = (installationUuid: string) =>
    templateService.getValidatedArgs({
        args: installationUuidPathArgs,
        request: {
            params: { installationUuid },
        } as unknown as Request,
        response: {} as unknown as Response,
    });

describe('MobilePushNotificationController installationUuid path validation', () => {
    it.each([
        'not-a-uuid',
        '12345',
        '10000000-0000-0000-8000-000000000003',
        '',
    ])(
        'rejects a malformed installationUuid (%j) at the request boundary',
        (malformedInstallationUuid) => {
            expect(() =>
                validateInstallationUuidPath(malformedInstallationUuid),
            ).toThrow(ValidateError);
        },
    );

    it('accepts a valid installationUuid', () => {
        const validInstallationUuid = '10000000-0000-4000-8000-000000000003';

        const [validatedInstallationUuid] = validateInstallationUuidPath(
            validInstallationUuid,
        );

        expect(validatedInstallationUuid).toBe(validInstallationUuid);
    });
});

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

describe('MobilePushNotificationController.registerInstallation', () => {
    const buildController = () => {
        const registerInstallation = vi.fn<
            MobilePushNotificationService['registerInstallation']
        >(async () => undefined);
        const services = {
            getMobilePushNotificationService: () => ({
                registerInstallation,
            }),
        } as unknown as ServiceRepository;
        return {
            registerInstallation,
            controller: new MobilePushNotificationController(services),
        };
    };

    const buildRequest = (authentication: Record<string, unknown>): Request =>
        ({
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
                authentication,
            },
        }) as unknown as Request;

    const installationUuid = '10000000-0000-4000-8000-000000000003' as UUID;
    const body = {
        environment: 'sandbox' as const,
        deviceToken: 'device-token',
    };

    it('records the OAuth client that registered the installation', async () => {
        const { controller, registerInstallation } = buildController();

        await controller.registerInstallation(
            buildRequest({
                type: 'oauth',
                clientId: 'oauth-mobile',
                token: 'oauth-token',
                scopes: ['read'],
                source: 'oauth-token',
            }),
            installationUuid,
            body,
        );

        expect(registerInstallation).toHaveBeenCalledWith(
            expect.objectContaining({ oauthClientId: 'oauth-mobile' }),
        );
    });

    it('records no OAuth client for a session request', async () => {
        const { controller, registerInstallation } = buildController();

        await controller.registerInstallation(
            buildRequest({ type: 'session', source: 'cookie' }),
            installationUuid,
            body,
        );

        expect(registerInstallation).toHaveBeenCalledWith(
            expect.objectContaining({ oauthClientId: null }),
        );
    });
});
