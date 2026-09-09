import { FeatureFlags } from '@lightdash/common';
import { lightdashConfig } from '../../../config/lightdashConfig';
import {
    assertLocalAnalyticsProjectEnabled,
    createLocalAnalyticsClient,
} from './localAnalyticsProject';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('./S3AnalyticsSource', () => ({
    createS3AnalyticsSourceResolver: vi.fn(),
}));

vi.mock('../../../config/lightdashConfig', () => ({
    lightdashConfig: {
        enabledFeatureFlags: new Set(),
        disabledFeatureFlags: new Set(),
        usageEvents: { s3: null },
    },
}));

describe('local analytics project gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lightdashConfig.usageEvents.s3 = null;
        lightdashConfig.enabledFeatureFlags.clear();
        lightdashConfig.disabledFeatureFlags.clear();
        lightdashConfig.enabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID', 'local-org');
    });
    afterEach(() => vi.unstubAllEnvs());
    it('allows the explicitly bound local org', () => {
        expect(() =>
            assertLocalAnalyticsProjectEnabled('local-org'),
        ).not.toThrow();
    });
    it('fails closed for another org', () => {
        expect(() => assertLocalAnalyticsProjectEnabled('other-org')).toThrow();
    });
    it('cannot be enabled in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        expect(() => assertLocalAnalyticsProjectEnabled('local-org')).toThrow();
    });
    it('requires an explicit feature flag and respects an explicit disable', () => {
        lightdashConfig.enabledFeatureFlags.clear();
        expect(() => assertLocalAnalyticsProjectEnabled('local-org')).toThrow();
        lightdashConfig.enabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
        lightdashConfig.disabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
        expect(() => assertLocalAnalyticsProjectEnabled('local-org')).toThrow();
    });

    it('requires configured storage rather than invoking an external login', () => {
        expect(() => createLocalAnalyticsClient('local-org')).toThrow(
            /storage is not configured/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
    });

    it('binds writer configuration and org without forwarding legacy date limits', () => {
        const storage = {
            endpoint: 'https://storage.googleapis.com',
            bucket: 'example-bucket',
            region: 'us-east4',
            accessKey: 'test-writer-key',
            secretKey: 'test-writer-secret',
            forcePathStyle: true,
        };
        lightdashConfig.usageEvents.s3 = storage;
        vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID', 'source-org');
        vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_START_DATE', '2026-09-07');
        vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_END_DATE', '2026-09-07');
        createLocalAnalyticsClient('local-org');
        expect(createS3AnalyticsSourceResolver).toHaveBeenCalledWith({
            storage,
            organizationUuid: 'source-org',
        });
    });
});
