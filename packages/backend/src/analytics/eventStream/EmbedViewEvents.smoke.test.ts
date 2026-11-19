import { S3 } from '@aws-sdk/client-s3';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { createS3AnalyticsSourceResolver } from '../../services/ProjectService/analyticsProject/S3AnalyticsSource';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { UsageEventsCompactor } from './UsageEventsCompactor';

const endpoint = process.env.USAGE_EMBED_VIEWS_SMOKE_ENDPOINT;

describe.skipIf(!endpoint)('embedded view events local S3 smoke test', () => {
    it('reconciles compacted loads by day and tenant across replay, failure and late arrivals', async () => {
        vi.unstubAllGlobals();
        if (
            !endpoint ||
            !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)
        ) {
            throw new Error('Smoke test requires local S3');
        }
        const storage = {
            endpoint,
            bucket: `usage-embed-views-${randomUUID()}`,
            region: 'us-east-1',
            accessKey: 'minioadmin',
            secretKey: 'minioadmin',
            forcePathStyle: true,
        };
        const s3 = new S3({
            endpoint,
            region: storage.region,
            forcePathStyle: true,
            credentials: {
                accessKeyId: storage.accessKey,
                secretAccessKey: storage.secretKey,
            },
        });
        const organizationUuid = randomUUID();
        const otherOrg = randomUUID();
        const stream = 'embed_view_events';
        const now = new Date('2026-10-10T00:00:00Z');
        const day = '2026-10-08';
        const nextDay = '2026-10-09';
        const view = (
            eventId: string,
            tenantId: string | null,
            date = day,
        ) => ({
            event_name: 'embed_dashboard.viewed',
            event_id: eventId,
            org_id: organizationUuid,
            project_id: 'project',
            content_id: 'shared-dashboard',
            content_type: 'dashboard',
            content_name: 'Revenue',
            external_user_id: tenantId ? 'shared-viewer-id' : null,
            embed_token_fingerprint: tenantId ? null : 'opaque-fingerprint',
            embed_tenant_id: tenantId,
            embed_tenant_attribute: tenantId ? 'brand' : null,
            event_ts: `${date}T10:00:00Z`,
            ingested_at: `${date}T10:00:01Z`,
            schema_version: 1,
        });
        const raw = (org: string, name: string, body: string, date = day) =>
            s3.putObject({
                Bucket: storage.bucket,
                Key: `events/raw/org_id=${org}/stream=${stream}/dt=${date}/${name}.jsonl.gz`,
                Body: gzipSync(body),
            });
        const jsonLines = (rows: ReturnType<typeof view>[]) =>
            rows.map((row) => JSON.stringify(row)).join('\n');
        const compact = () =>
            new UsageEventsCompactor({
                s3Config: storage,
                prometheusMetrics: null,
                usageDimensionsModel: {
                    async *getOrganizations() {
                        yield {
                            organization_id: 1,
                            organization_uuid: organizationUuid,
                        };
                        yield {
                            organization_id: 2,
                            organization_uuid: otherOrg,
                        };
                    },
                    async *getJsonLines() {},
                },
            }).run(now);
        const reader = (org: string) =>
            new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource: createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                    allowEmpty: true,
                }),
            });
        const explore = createAnalyticsExplores().find(
            ({ name }) => name === stream,
        )!;
        const loads = `${stream}_loads`;
        const viewers = `${stream}_distinct_external_viewers`;
        const tenants = `${stream}_distinct_tenants`;
        const query = async (org: string, dimensions: string[] = []) => {
            const compiled = new MetricQueryBuilder({
                explore,
                compiledMetricQuery: {
                    exploreName: stream,
                    dimensions: dimensions.map((name) => `${stream}_${name}`),
                    metrics: [loads, viewers, tenants],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                    compiledAdditionalMetrics: [],
                    compiledCustomDimensions: [],
                },
                warehouseSqlBuilder: warehouseSqlBuilderFromType(
                    WarehouseTypes.DUCKDB,
                ),
                intrinsicUserAttributes: {},
                parameterDefinitions: {},
                timezone: 'UTC',
            }).compileQuery();
            expect(compiled.warnings).toEqual([]);
            const start = performance.now();
            const result = await reader(org).runQuery(compiled.query);
            console.info(
                `Embed view Explore (${dimensions.join(', ') || 'totals'}): ${Math.round(performance.now() - start)}ms`,
            );
            return result.rows;
        };
        const totals = (
            loadCount: number,
            viewerCount: number,
            tenantCount: number,
        ) => [
            {
                [loads]: String(loadCount),
                [viewers]: String(viewerCount),
                [tenants]: String(tenantCount),
            },
        ];
        await s3.createBucket({ Bucket: storage.bucket });
        try {
            expect(await query(organizationUuid)).toEqual(totals(0, 0, 0));
            const tenantA = view('load-a', 'tenant-a');
            await raw(
                organizationUuid,
                'first',
                jsonLines([
                    tenantA,
                    view('load-b', 'tenant-b'),
                    view('load-unknown', null),
                ]),
            );
            await raw(
                otherOrg,
                'other',
                jsonLines([{ ...tenantA, org_id: otherOrg }]),
            );
            expect(await compact()).toMatchObject({
                partitionsCompacted: 2,
                partitionsFailed: 0,
            });
            expect(await query(organizationUuid)).toEqual(totals(3, 2, 2));
            expect(await query(otherOrg)).toEqual(totals(1, 1, 1));
            expect(await compact()).toMatchObject({
                partitionsCompacted: 0,
                partitionsFailed: 0,
            });
            expect(await query(organizationUuid)).toEqual(totals(3, 2, 2));

            await raw(organizationUuid, 'late', 'not json');
            expect(await compact()).toMatchObject({
                partitionsCompacted: 0,
                partitionsFailed: 1,
            });
            expect(await query(organizationUuid)).toEqual(totals(3, 2, 2));
            await raw(
                organizationUuid,
                'late',
                jsonLines([tenantA, view('late-load-a', 'tenant-a')]),
            );
            await raw(
                organizationUuid,
                'next-day',
                jsonLines([view('next-load-b', 'tenant-b', nextDay)]),
                nextDay,
            );
            expect(await compact()).toMatchObject({
                partitionsCompacted: 2,
                partitionsFailed: 0,
            });
            const source = await reader(organizationUuid).runQuery(
                'SELECT count(*) AS rows, count(DISTINCT event_id) AS interactions FROM embed_view_events',
            );
            expect(source.rows).toEqual([{ rows: '6', interactions: '5' }]);
            expect(await query(organizationUuid)).toEqual(totals(5, 2, 2));
            const grouped = await query(organizationUuid, [
                'event_ts_day',
                'embed_tenant_id',
                'tenant_coverage',
                'viewer_coverage',
            ]);
            expect(grouped).toHaveLength(4);
            expect(grouped).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        [`${stream}_embed_tenant_id`]: 'tenant-a',
                        [loads]: '2',
                        [viewers]: '1',
                        [tenants]: '1',
                    }),
                    expect.objectContaining({
                        [`${stream}_embed_tenant_id`]: 'tenant-b',
                        [loads]: '1',
                        [viewers]: '1',
                        [tenants]: '1',
                    }),
                    expect.objectContaining({
                        [`${stream}_tenant_coverage`]: 'Unknown tenant',
                        [`${stream}_viewer_coverage`]: 'Anonymous (token only)',
                        [loads]: '1',
                        [viewers]: '0',
                        [tenants]: '0',
                    }),
                ]),
            );
        } finally {
            const page = await s3.listObjectsV2({ Bucket: storage.bucket });
            if (page.Contents?.length) {
                await s3.deleteObjects({
                    Bucket: storage.bucket,
                    Delete: {
                        Objects: page.Contents.map(({ Key }) => ({ Key })),
                    },
                });
            }
            await s3.deleteBucket({ Bucket: storage.bucket });
            s3.destroy();
        }
    }, 120_000);
});
