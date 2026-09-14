import { FeatureFlags } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import {
    assertAnalyticsProjectEnabled,
    createAnalyticsClient,
} from './analyticsProjectClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('./S3AnalyticsSource', () => ({
    createS3AnalyticsSourceResolver: vi.fn(),
}));
vi.mock('@lightdash/warehouses', () => ({ DuckdbWarehouseClient: vi.fn() }));
vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

describe('analytics project gate', () => {
    const overrides = new Map<string, boolean>();
    const database = vi.fn((table: string) => {
        let org: string;
        const builder = {
            where: vi.fn((key: string, value: string) => {
                if (key === 'organization_uuid') org = value;
                return builder;
            }),
            whereNull: vi.fn(() => builder),
            first: vi.fn(async () => {
                if (table === 'feature_flags')
                    return { default_enabled: false };
                return overrides.has(org)
                    ? { enabled: overrides.get(org) }
                    : undefined;
            }),
        };
        return builder;
    });
    const flags = new FeatureFlagModel({
        database: database as unknown as Knex,
        lightdashConfig: lightdashConfigMock,
    });
    const storage = {
        endpoint: 'https://storage.googleapis.com',
        bucket: 'example-bucket',
        region: 'us-east4',
        accessKey: 'test-writer-key',
        secretKey: 'test-writer-secret',
        forcePathStyle: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        overrides.clear();
        lightdashConfig.usageEvents.s3 = storage;
        lightdashConfig.enabledFeatureFlags.clear();
        lightdashConfig.disabledFeatureFlags.clear();
        overrides.set('org', true);
    });
    afterEach(() => vi.unstubAllEnvs());

    it('honors a Console organization flag without an ENV flag', async () => {
        await expect(
            assertAnalyticsProjectEnabled(flags, 'org'),
        ).resolves.toBeUndefined();
        await createAnalyticsClient('org', flags);
        expect(createS3AnalyticsSourceResolver).toHaveBeenCalledWith({
            storage,
            organizationUuid: 'org',
        });
    });

    it('does not enable another organization from a Console override', async () => {
        await expect(createAnalyticsClient('other-org', flags)).rejects.toThrow(
            /not enabled/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
    });

    it.each(['development', 'production'])(
        'uses standard ENV precedence in %s',
        async (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            overrides.clear();
            await expect(createAnalyticsClient('org', flags)).rejects.toThrow(
                /not enabled/,
            );
            lightdashConfig.enabledFeatureFlags.add(
                FeatureFlags.AnalyticsProject,
            );
            await expect(
                assertAnalyticsProjectEnabled(flags, 'org'),
            ).resolves.toBeUndefined();
            lightdashConfig.disabledFeatureFlags.add(
                FeatureFlags.AnalyticsProject,
            );
            // Standard resolver: ENV enable wins when both lists include a flag.
            await expect(
                assertAnalyticsProjectEnabled(flags, 'org'),
            ).resolves.toBeUndefined();
            lightdashConfig.enabledFeatureFlags.clear();
            overrides.set('org', true);
            await expect(createAnalyticsClient('org', flags)).rejects.toThrow(
                /not enabled/,
            );
            expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
        },
    );

    it('requires configured storage rather than invoking an external login', async () => {
        lightdashConfig.usageEvents.s3 = null;
        await expect(createAnalyticsClient('org', flags)).rejects.toThrow(
            /storage is not configured/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
    });

    it.each(['development', 'production'])(
        'binds writer configuration to the persisted org in %s, ignoring legacy overrides',
        async (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            overrides.set('persisted-org', true);
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID', 'legacy-org');
            vi.stubEnv(
                'LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID',
                'source-org',
            );
            await createAnalyticsClient('persisted-org', flags);
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

    it('rechecks Console flag changes on an existing client without a restart', async () => {
        const resolve = vi.fn().mockResolvedValue({});
        vi.mocked(createS3AnalyticsSourceResolver).mockReturnValue(resolve);
        await createAnalyticsClient('org', flags);
        const [config] = vi.mocked(DuckdbWarehouseClient).mock.calls[0];
        if (!config || config.type !== 'duckdb_parquet')
            throw new Error('Wrong client');
        await config.resolveSource();
        resolve.mockClear();
        overrides.set('org', false);
        await expect(config.resolveSource()).rejects.toThrow(/not enabled/);
        expect(resolve).not.toHaveBeenCalled();
        overrides.set('org', true);
        await config.resolveSource();
        expect(resolve).toHaveBeenCalledOnce();
    });
});
