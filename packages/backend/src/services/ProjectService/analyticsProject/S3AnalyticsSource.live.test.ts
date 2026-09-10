import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { parse } from 'dotenv';
import { readFile } from 'fs/promises';
import { parseAnalyticsS3Config } from '../../../config/parseConfig';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

// Reads only the named storage settings. Never loads another instance's DB config.
describe.skipIf(!process.env.ANALYTICS_S3_LIVE_ENV_FILE)(
    'signed analytics URLs against existing cloud Parquet (read-only)',
    () => {
        beforeAll(() => vi.unstubAllGlobals());
        afterEach(() => vi.unstubAllEnvs());

        it('queries both streams without CLI authentication or bucket credentials in DuckDB', async () => {
            const settings = parse(
                await readFile(process.env.ANALYTICS_S3_LIVE_ENV_FILE!, 'utf8'),
            );
            for (const name of [
                'ENDPOINT',
                'BUCKET',
                'REGION',
                'ACCESS_KEY',
                'SECRET_KEY',
            ]) {
                const key = `ANALYTICS_S3_${name}`;
                vi.stubEnv(key, settings[key] ?? '');
            }
            const storage = parseAnalyticsS3Config();
            if (!storage)
                throw new Error(
                    'Complete ANALYTICS_S3_* reader settings are required',
                );
            const resolveSource = createS3AnalyticsSourceResolver({
                storage,
                organizationUuid: process.env.ANALYTICS_S3_LIVE_ORG_UUID ?? '',
            });
            const source = await resolveSource();
            expect(source).not.toHaveProperty('s3Config');
            expect(source).not.toHaveProperty('httpAuth');
            expect(source.tables.map(({ name }) => name).sort()).toEqual([
                'ai_usage',
                'query_events',
            ]);
            const reader = new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource,
            });
            const queries = await reader.runQuery(
                'SELECT count(*) AS events FROM query_events',
            );
            const ai = await reader.runQuery(
                'SELECT count(*) AS events, sum(total_tokens) AS total_tokens FROM ai_usage',
            );
            expect(Number(queries.rows[0].events)).toBeGreaterThan(0);
            expect(Number(ai.rows[0].events)).toBeGreaterThan(0);
            expect(Number(ai.rows[0].total_tokens)).toBeGreaterThan(0);
            // Counts only: do not print URLs, tokens, object names or user records.
            console.info('Verified live analytics counts', {
                queryEvents: queries.rows[0].events,
                aiUsage: ai.rows[0].events,
            });
            await expect(
                reader.runQuery('SELECT sql FROM duckdb_views()'),
            ).rejects.toThrow(/catalog access/);
        }, 120_000);
    },
);
