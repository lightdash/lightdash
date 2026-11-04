import { lightdashConfig } from '../config/lightdashConfig';
import { isAnalyticsProjectAvailable } from '../services/ProjectService/analyticsProject/analyticsProjectAvailability';
import { ServiceRepository } from '../services/ServiceRepository';
import LicenseClient from './clients/License/LicenseClient';
import { getEnterpriseAppArguments } from './index';

describe('analytics provider registration', () => {
    const originalStorage = lightdashConfig.usageEvents.s3;
    const originalLicense = { ...lightdashConfig.license };
    const originalEnabledFlags = lightdashConfig.enabledFeatureFlags;

    beforeEach(() => {
        lightdashConfig.usageEvents.s3 = {
            endpoint: 'http://localhost:9000',
            bucket: 'test',
            region: 'us-east-1',
        };
        lightdashConfig.license.licenseKey = 'test-key';
        lightdashConfig.enabledFeatureFlags = new Set(['analytics-project']);
    });

    afterEach(() => {
        lightdashConfig.usageEvents.s3 = originalStorage;
        lightdashConfig.analyticsProject.disabled = false;
        lightdashConfig.license = { ...originalLicense };
        lightdashConfig.enabledFeatureFlags = originalEnabledFlags;
        vi.restoreAllMocks();
    });

    it.each(['missing', 'invalid', 'valid'] as const)(
        'uses %s license registration for management and maintenance access',
        async (license) => {
            lightdashConfig.license.licenseKey =
                license === 'missing' ? null : 'test-key';
            const validate = vi
                .spyOn(LicenseClient.prototype, 'get')
                .mockResolvedValue({
                    isValid: license === 'valid',
                    detail: 'test license',
                    code: license === 'valid' ? 'VALID' : 'INVALID',
                });
            const { modelProviders, serviceProviders } =
                await getEnterpriseAppArguments();
            expect(Boolean(serviceProviders?.analyticsProjectService)).toBe(
                license === 'valid',
            );
            const repository = new ServiceRepository({
                context: { lightdashConfig },
                serviceProviders,
            } as unknown as ConstructorParameters<typeof ServiceRepository>[0]);
            expect(
                isAnalyticsProjectAvailable(
                    lightdashConfig,
                    repository.getLicenseService(),
                ),
            ).toBe(license === 'valid');
            lightdashConfig.analyticsProject.disabled = true;
            expect(
                isAnalyticsProjectAvailable(
                    lightdashConfig,
                    repository.getLicenseService(),
                ),
            ).toBe(false);
            lightdashConfig.analyticsProject.disabled = false;
            expect(validate).toHaveBeenCalledTimes(
                license === 'missing' ? 0 : 1,
            );
        },
    );

    it('has no management service fallback without a registered provider', () => {
        const repository = new ServiceRepository(
            {} as ConstructorParameters<typeof ServiceRepository>[0],
        );
        expect(() => repository.getAnalyticsProjectService()).toThrow(
            "Unable to initialize service 'analyticsProjectService'",
        );
    });
});
