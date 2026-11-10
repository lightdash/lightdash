import { lightdashConfig } from '../config/lightdashConfig';
import LicenseClient from './clients/License/LicenseClient';
import { getEnterpriseAppArguments } from './index';

describe('enterprise OAuth service registration', () => {
    const originalLicense = { ...lightdashConfig.license };

    afterEach(() => {
        lightdashConfig.license = { ...originalLicense };
        vi.restoreAllMocks();
    });

    it('passes both token-exchange services to the OAuth service', async () => {
        lightdashConfig.license.licenseKey = 'test-key';
        vi.spyOn(LicenseClient.prototype, 'get').mockResolvedValue({
            isValid: true,
            detail: 'test license',
            code: 'VALID',
        } as never);
        const { serviceProviders } = await getEnterpriseAppArguments();
        const getManagedSignInService = vi.fn();
        const getMobileSignInService = vi.fn();
        const oauthService = serviceProviders!.oauthService!({
            models: {
                getUserModel: () => ({}),
                getOauthModel: () => ({}),
            },
            context: { lightdashConfig },
            repository: { getManagedSignInService, getMobileSignInService },
        } as never) as unknown as {
            getManagedSignInService: () => unknown;
            getMobileSignInService: () => unknown;
        };

        oauthService.getManagedSignInService();
        oauthService.getMobileSignInService();
        expect(getManagedSignInService).toHaveBeenCalledOnce();
        expect(getMobileSignInService).toHaveBeenCalledOnce();
    });
});
