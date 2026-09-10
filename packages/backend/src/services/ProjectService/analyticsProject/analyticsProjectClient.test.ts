import { FeatureFlags } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import {
    assertAnalyticsProjectEnabled,
    createAnalyticsClient,
} from './analyticsProjectClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('./S3AnalyticsSource', () => ({
    createS3AnalyticsSourceResolver: vi.fn(),
}));
vi.mock('@lightdash/warehouses', () => ({ DuckdbWarehouseClient: vi.fn() }));

vi.mock('../../../config/lightdashConfig', () => ({
    lightdashConfig: {
        enabledFeatureFlags: new Set(),
        disabledFeatureFlags: new Set(),
        usageEvents: { s3: null },
    },
}));

describe('analytics project gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lightdashConfig.usageEvents.s3 = null;
        lightdashConfig.enabledFeatureFlags.clear();
        lightdashConfig.disabledFeatureFlags.clear();
        lightdashConfig.enabledFeatureFlags.add(FeatureFlags.AnalyticsProject);
    });
    afterEach(() => vi.unstubAllEnvs());
    it.each(['development', 'production'])(
        'requires the flag and respects explicit disable in %s',
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

    it('requires configured storage rather than invoking an external login', () => {
        expect(() => createAnalyticsClient('org')).toThrow(
            /storage is not configured/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
    });

    it.each(['development', 'production'])(
        'binds existing writer configuration to the persisted org in %s, ignoring legacy overrides',
        (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            const storage = {
                endpoint: 'https://storage.googleapis.com',
                bucket: 'example-bucket',
                region: 'us-east4',
                accessKey: 'test-writer-key',
                secretKey: 'test-writer-secret',
                forcePathStyle: true,
            };
            lightdashConfig.usageEvents.s3 = storage;
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID', 'legacy-org');
            vi.stubEnv(
                'LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID',
                'source-org',
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

    it('rechecks the flag before resolving an existing client', async () => {
        lightdashConfig.usageEvents.s3 = {
            endpoint: 'https://storage.googleapis.com',
            region: 'us-east4',
            bucket: 'example-bucket',
            accessKey: 'writer-key',
            secretKey: 'writer-secret',
        };
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
