import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EnterpriseLicenseService } from '../../../ee/services/LicenseService/LicenseService';
import { LicenseService } from '../../LicenseService/LicenseService';
import { isAnalyticsProjectAvailable } from './analyticsProjectAvailability';

describe('managed analytics availability', () => {
    it.each([
        { licensed: true, disabled: false, storage: true, expected: true },
        { licensed: true, disabled: true, storage: true, expected: false },
        { licensed: false, disabled: false, storage: true, expected: false },
        { licensed: true, disabled: false, storage: false, expected: false },
    ])(
        'requires validated licensing and storage, respects opt-out: %j',
        ({ licensed, disabled, storage, expected }) => {
            const config = {
                ...lightdashConfigMock,
                analyticsProject: { disabled },
                usageEvents: {
                    ...lightdashConfigMock.usageEvents,
                    s3: storage
                        ? {
                              endpoint: 'http://localhost:9000',
                              bucket: 'test',
                              region: 'us-east-1',
                          }
                        : null,
                },
                // Retired rollout state must not opt an unlicensed instance in, nor
                // prevent licensed instances from using Analytics by default.
                enabledFeatureFlags: new Set(['analytics-project']),
                disabledFeatureFlags: new Set(['analytics-project']),
            };
            const license = licensed
                ? new EnterpriseLicenseService({ licenseKey: 'test' })
                : new LicenseService({ licenseKey: 'invalid' });
            expect(isAnalyticsProjectAvailable(config, license)).toBe(expected);
        },
    );
});
