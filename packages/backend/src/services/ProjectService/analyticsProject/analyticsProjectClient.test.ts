import { FeatureFlags } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import {
    assertAnalyticsProjectEnabled,
    createAnalyticsClient,
} from './analyticsProjectClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('@lightdash/warehouses', () => ({ DuckdbWarehouseClient: vi.fn() }));
vi.mock('./S3AnalyticsSource', () => ({
    createS3AnalyticsSourceResolver: vi.fn(),
}));
vi.mock('../../../config/lightdashConfig', () => ({
    lightdashConfig: {
        enabledFeatureFlags: new Set(),
        disabledFeatureFlags: new Set(),
        analytics: { s3: null },
        usageEvents: { s3: null },
    },
}));

describe('analytics reader configuration and gate', () => {
    const storage = {
        endpoint: 'https://storage.googleapis.com',
        bucket: 'example-bucket',
        region: 'us-east4',
        accessKey: 'test-reader-key',
        secretKey: 'test-reader-secret',
        forcePathStyle: true as const,
    };
    beforeEach(() => {
        vi.clearAllMocks();
        lightdashConfig.analytics.s3 = storage;
        lightdashConfig.usageEvents.s3 = {
            ...storage,
            accessKey: 'writer-key',
            secretKey: 'writer-secret',
        };
        lightdashConfig.enabledFeatureFlags.clear();
        lightdashConfig.disabledFeatureFlags.clear();
        lightdashConfig.enabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
    });
    afterEach(() => vi.unstubAllEnvs());

    it.each(['development', 'production'])(
        'uses explicit feature gating in %s',
        (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            expect(() => assertAnalyticsProjectEnabled()).not.toThrow();
            lightdashConfig.enabledFeatureFlags.clear();
            expect(() => createAnalyticsClient('org')).toThrow(/not enabled/);
            lightdashConfig.enabledFeatureFlags.add(
                FeatureFlags.AnalyticsProject,
            );
            lightdashConfig.disabledFeatureFlags.add(
                FeatureFlags.AnalyticsProject,
            );
            expect(() => createAnalyticsClient('org')).toThrow(/not enabled/);
            expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
            expect(DuckdbWarehouseClient).not.toHaveBeenCalled();
        },
    );

    it('never falls back to configured writer credentials', () => {
        lightdashConfig.analytics.s3 = null;
        expect(() => createAnalyticsClient('org')).toThrow(/ANALYTICS_S3_/);
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
        expect(DuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    it.each(['development', 'production'])(
        'binds the persisted org and reader only in %s, ignoring legacy overrides',
        (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID', 'legacy-org');
            vi.stubEnv(
                'LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID',
                'other-org',
            );
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_START_DATE', '2026-09-07');
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_END_DATE', '2026-09-07');
            createAnalyticsClient('persisted-org');
            expect(createS3AnalyticsSourceResolver).toHaveBeenCalledWith({
                storage,
                organizationUuid: 'persisted-org',
            });
            expect(DuckdbWarehouseClient).toHaveBeenCalledWith({
                type: 'duckdb_parquet',
                resolveSource: expect.any(Function),
            });
        },
    );

    it('checks the flag again before resolving an existing client', async () => {
        const resolve = vi.fn();
        vi.mocked(createS3AnalyticsSourceResolver).mockReturnValue(resolve);
        createAnalyticsClient('org');
        const [config] = vi.mocked(DuckdbWarehouseClient).mock.calls[0];
        if (!config || config.type !== 'duckdb_parquet')
            throw new Error('Wrong client');
        lightdashConfig.disabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
        await expect(config.resolveSource()).rejects.toThrow(/not enabled/);
        expect(resolve).not.toHaveBeenCalled();
    });
});
