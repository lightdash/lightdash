import { MobileOrgDisabledError } from '@lightdash/common';
import type { Request } from 'express';
import { buildAccount } from '../auth/account/account.mock';
import type { ServiceRepository } from '../services/ServiceRepository';
import { MobileAppAccessController } from './mobileAppAccessController';

const account = buildAccount({ accountType: 'session' });
const request = { account } as unknown as Request;
const organizationUuid = account.organization.organizationUuid!;

it('answers enabled with the organization of the sign-in and never caches', async () => {
    const getAppAccess = vi
        .fn()
        .mockResolvedValue({ enabled: true, organizationUuid });
    const controller = new MobileAppAccessController({
        getMobileSignInService: () => ({ getAppAccess }),
    } as unknown as ServiceRepository);

    expect(await controller.getMobileAppAccess(request)).toEqual({
        status: 'ok',
        results: { enabled: true, organizationUuid },
    });
    expect(controller.getHeaders()).toEqual({ 'Cache-Control': 'no-store' });
    expect(getAppAccess).toHaveBeenCalledWith(
        expect.objectContaining({ organizationUuid }),
    );
});

it('passes the disabled organization error through', async () => {
    const controller = new MobileAppAccessController({
        getMobileSignInService: () => ({
            getAppAccess: vi
                .fn()
                .mockRejectedValue(
                    new MobileOrgDisabledError(organizationUuid),
                ),
        }),
    } as unknown as ServiceRepository);

    await expect(controller.getMobileAppAccess(request)).rejects.toMatchObject({
        statusCode: 401,
        name: 'MobileOrgDisabledError',
        data: { code: 'mobile_org_disabled', organizationUuid },
    });
});
