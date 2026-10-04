import { ForbiddenError, type Account } from '@lightdash/common';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { type AwsWebIdentityAudienceModel } from '../models/AwsWebIdentityAudienceModel';
import { type AwsWebIdentityResolver } from '../utils/awsWebIdentity/AwsWebIdentityResolver';
import { AwsWebIdentityService } from './AwsWebIdentityService';

const account = {
    isRegisteredUser: () => true,
    isSessionUser: () => false,
    user: { userUuid: 'user-uuid', id: 'user-uuid', type: 'registered' },
    organization: {
        organizationUuid: 'org-uuid',
        name: 'Org',
        createdAt: new Date(),
    },
} as unknown as Account;

const buildService = (enabled: boolean) => {
    const create = vi.fn(async () => 'lightdash-generated');
    const service = new AwsWebIdentityService({
        lightdashConfig: {
            ...lightdashConfigMock,
            athenaWarehouseWebIdentityAuth: { enabled },
        },
        awsWebIdentityAudienceModel: {
            create,
        } as unknown as AwsWebIdentityAudienceModel,
        awsWebIdentityResolver: {
            getSubject: async () => '111429504119237381932',
        } as unknown as AwsWebIdentityResolver,
    });
    return { service, create };
};

describe('AwsWebIdentityService.getIdentity', () => {
    test("returns this instance's subject", async () => {
        await expect(
            buildService(true).service.getIdentity(account),
        ).resolves.toEqual({ subject: '111429504119237381932' });
    });

    test('refuses when the instance has not enabled it', async () => {
        await expect(
            buildService(false).service.getIdentity(account),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('AwsWebIdentityService.createAudience', () => {
    test("generates an audience for the user's organization", async () => {
        const { service, create } = buildService(true);

        await expect(service.createAudience(account)).resolves.toEqual({
            audience: 'lightdash-generated',
            subject: '111429504119237381932',
        });
        expect(create).toHaveBeenCalledWith('org-uuid', 'user-uuid');
    });

    test('refuses when the instance has not enabled it', async () => {
        const { service, create } = buildService(false);

        await expect(service.createAudience(account)).rejects.toThrow(
            ForbiddenError,
        );
        expect(create).not.toHaveBeenCalled();
    });
});
