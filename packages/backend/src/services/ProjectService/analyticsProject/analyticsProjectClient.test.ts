import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
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
    const isEnabled = vi.fn(() => true);
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
        isEnabled.mockReturnValue(true);
        lightdashConfig.usageEvents.s3 = storage;
    });
    afterEach(() => vi.unstubAllEnvs());

    it('rejects disabled or unlicensed analytics before storage access', async () => {
        isEnabled.mockReturnValue(false);
        await expect(createAnalyticsClient('org', isEnabled)).rejects.toThrow(
            /not enabled/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
        expect(DuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    it('enables every organization by default without rollout queries', async () => {
        await expect(
            assertAnalyticsProjectEnabled(isEnabled),
        ).resolves.toBeUndefined();
        await createAnalyticsClient('org', isEnabled);
        await createAnalyticsClient('other-org', isEnabled);
        expect(createS3AnalyticsSourceResolver).toHaveBeenCalledWith({
            storage,
            organizationUuid: 'org',
        });
        expect(createS3AnalyticsSourceResolver).toHaveBeenCalledWith({
            storage,
            organizationUuid: 'other-org',
        });
    });

    it('requires configured storage rather than invoking an external login', async () => {
        lightdashConfig.usageEvents.s3 = null;
        await expect(createAnalyticsClient('org', isEnabled)).rejects.toThrow(
            /storage is not configured/,
        );
        expect(createS3AnalyticsSourceResolver).not.toHaveBeenCalled();
    });

    it.each(['development', 'production'])(
        'binds writer configuration to the persisted org in %s, ignoring legacy overrides',
        async (environment) => {
            vi.stubEnv('NODE_ENV', environment);
            vi.stubEnv('LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID', 'legacy-org');
            vi.stubEnv(
                'LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID',
                'source-org',
            );
            await createAnalyticsClient('persisted-org', isEnabled);
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

    it('forwards table references after authorization', async () => {
        const resolve = vi.fn().mockResolvedValue({});
        vi.mocked(createS3AnalyticsSourceResolver).mockReturnValue(resolve);
        await createAnalyticsClient('org', isEnabled);
        const [config] = vi.mocked(DuckdbWarehouseClient).mock.calls[0];
        if (!config || config.type !== 'duckdb_parquet')
            throw new Error('Wrong client');
        await config.resolveSource(['export_events']);
        expect(resolve).toHaveBeenCalledWith(['export_events']);
        resolve.mockClear();
        isEnabled.mockReturnValue(false);
        await expect(config.resolveSource(['export_events'])).rejects.toThrow(
            /not enabled/,
        );
        expect(resolve).not.toHaveBeenCalled();
    });

    it('rechecks availability on an existing client before storage access', async () => {
        const resolve = vi.fn().mockResolvedValue({});
        vi.mocked(createS3AnalyticsSourceResolver).mockReturnValue(resolve);
        await createAnalyticsClient('org', isEnabled);
        const [config] = vi.mocked(DuckdbWarehouseClient).mock.calls[0];
        if (!config || config.type !== 'duckdb_parquet')
            throw new Error('Wrong client');
        await config.resolveSource();
        resolve.mockClear();
        isEnabled.mockReturnValue(false);
        await expect(config.resolveSource()).rejects.toThrow(/not enabled/);
        expect(resolve).not.toHaveBeenCalled();
        isEnabled.mockReturnValue(true);
        await config.resolveSource();
        expect(resolve).toHaveBeenCalledOnce();
    });
});
