import { FeatureFlags } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfig } from '../config/lightdashConfig';
import { ModelRepository } from '../models/ModelRepository';
import { ServiceRepository } from '../services/ServiceRepository';
import { UtilRepository } from '../utils/UtilRepository';
import LicenseClient from './clients/License/LicenseClient';
import { getEnterpriseAppArguments } from './index';

describe('analytics provider registration', () => {
    const originalLicense = { ...lightdashConfig.license };
    const originalEnabledFlags = lightdashConfig.enabledFeatureFlags;

    beforeEach(() => {
        lightdashConfig.license.licenseKey = 'test-key';
        lightdashConfig.enabledFeatureFlags = new Set([
            FeatureFlags.AnalyticsProject,
        ]);
    });

    afterEach(() => {
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
            // The maintenance script uses these same lazy repositories.
            const models = new ModelRepository({
                database: {} as Knex,
                lightdashConfig,
                modelProviders,
                utils: new UtilRepository({ lightdashConfig }),
            });
            await expect(
                models.getFeatureFlagModel().get({
                    featureFlagId: FeatureFlags.AnalyticsProject,
                    user: { organizationUuid: 'org' },
                }),
            ).resolves.toEqual({
                id: FeatureFlags.AnalyticsProject,
                enabled: license === 'valid',
            });
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
