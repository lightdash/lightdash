import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';

// Real DuckDB instance: the serve session's engine-level restrictions, not SQL validation
describe('object-storage serve sessions', () => {
    const client = DuckdbWarehouseClient.createForPreAggregate(
        {
            type: 'duckdb_s3',
            s3Config: {
                endpoint: 'localhost:9000',
                region: 'us-east-1',
                accessKey: 'key',
                secretKey: 'secret',
                forcePathStyle: true,
                useSsl: false,
                scope: ['s3://bucket/materialization.parquet'],
            },
        },
        {
            instanceCacheKey: 'object-storage-serve-test',
            objectStorageOnly: true,
            sharedResourceLimits: { memoryLimit: '64MB', threads: 2 },
        },
    );

    afterAll(async () => {
        await client.close();
    });

    it('has no local filesystem access', async () => {
        await expect(
            client.runQuery(
                "SELECT length(content) AS n FROM read_text('/etc/hostname')",
            ),
        ).rejects.toThrow(/disabled by configuration/);
        await expect(
            client.runQuery("SELECT count(*) AS n FROM glob('/tmp/*')"),
        ).rejects.toThrow(/disabled by configuration/);
    });

    it('still spills to its temp directory under the memory limit', async () => {
        const { rows } = await client.runQuery(
            'SELECT count(*) AS n FROM (SELECT i, md5(i::VARCHAR) AS h FROM range(1500000) t(i) ORDER BY h)',
        );
        expect(Number(rows[0].n)).toBe(1500000);
    }, 60_000);

    it('rejects statements that would change the session', async () => {
        await expect(
            client.runQuery('SET enable_external_access = true'),
        ).rejects.toThrow(/only SELECT statements are allowed/);
        await expect(
            client.runQuery("SELECT 1; SET allowed_directories = ['/']"),
        ).rejects.toThrow(/multiple SQL statements are not allowed/);
    });
});
