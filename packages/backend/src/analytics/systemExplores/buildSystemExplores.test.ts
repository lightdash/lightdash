import { ExploreType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildSystemExplores,
    getSystemExploresForProject,
} from './buildSystemExplores';

const ORGANIZATION_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';
const BUCKET = 'my-bucket';

const buildArgs = {
    organizationUuid: ORGANIZATION_UUID,
    bucket: BUCKET,
    startOfWeek: null,
};

describe('buildSystemExplores', () => {
    it('generates one explore per registered stream', () => {
        const explores = buildSystemExplores(buildArgs);
        expect(explores.map((e) => e.name)).toEqual(['lightdash_query_events']);
    });

    it('generates a SYSTEM explore over the compacted zone for the org', () => {
        const [explore] = buildSystemExplores(buildArgs);
        expect(explore.type).toBe(ExploreType.SYSTEM);
        expect(explore.baseTable).toBe('lightdash_query_events');
        expect(explore.tables.lightdash_query_events.sqlTable).toBe(
            `read_parquet('s3://${BUCKET}/events/compacted/org_id=${ORGANIZATION_UUID}/stream=query_events/**/*.parquet', hive_partitioning=true, union_by_name=true)`,
        );
    });

    it('creates granularity dimensions for timestamp columns', () => {
        const [explore] = buildSystemExplores(buildArgs);
        const { dimensions } = explore.tables.lightdash_query_events;
        expect(dimensions.event_ts.isIntervalBase).toBe(true);
        expect(Object.keys(dimensions)).toEqual(
            expect.arrayContaining([
                'event_ts_raw',
                'event_ts_day',
                'event_ts_week',
                'event_ts_month',
                'event_ts_quarter',
                'event_ts_year',
            ]),
        );
        expect(dimensions.event_ts_day.compiledSql).toBe(
            'DATE_TRUNC(\'DAY\', "lightdash_query_events"."event_ts")',
        );
    });

    it('compiles curated metrics with DuckDB aggregations', () => {
        const [explore] = buildSystemExplores(buildArgs);
        const { metrics } = explore.tables.lightdash_query_events;
        expect(metrics.total_events.compiledSql).toBe(
            'COUNT("lightdash_query_events"."event_name")',
        );
        expect(metrics.unique_users.compiledSql).toBe(
            'COUNT(DISTINCT "lightdash_query_events"."user_id")',
        );
        expect(metrics.p90_warehouse_execution_time_ms.compiledSql).toBe(
            'QUANTILE_CONT("lightdash_query_events"."warehouse_execution_time_ms", 0.9)',
        );
    });

    it('matches the snapshot', () => {
        expect(buildSystemExplores(buildArgs)).toMatchSnapshot();
    });
});

describe('getSystemExploresForProject', () => {
    const enabledConfig = {
        usageEvents: {
            enabled: true,
            flushIntervalMs: 1000,
            flushBatchSize: 100,
            bufferMaxSize: 1000,
            s3: {
                bucket: BUCKET,
                region: 'us-east-1',
                endpoint: 'http://localhost:9000',
                forcePathStyle: true,
            },
        },
        allowMultiOrgs: false,
    };
    const enabledProject = {
        organizationUuid: ORGANIZATION_UUID,
        systemExploresEnabled: true,
        warehouseConnection: undefined,
    };

    it('returns explores when usage events and the project toggle are enabled', () => {
        const explores = getSystemExploresForProject(
            enabledConfig,
            enabledProject,
        );
        expect(explores).toHaveLength(1);
    });

    it('returns nothing when usage events are disabled', () => {
        expect(
            getSystemExploresForProject(
                {
                    ...enabledConfig,
                    usageEvents: {
                        ...enabledConfig.usageEvents,
                        enabled: false,
                    },
                },
                enabledProject,
            ),
        ).toEqual([]);
    });

    it('returns nothing without an S3 config', () => {
        expect(
            getSystemExploresForProject(
                {
                    ...enabledConfig,
                    usageEvents: { ...enabledConfig.usageEvents, s3: null },
                },
                enabledProject,
            ),
        ).toEqual([]);
    });

    it('returns nothing on multi-org instances', () => {
        expect(
            getSystemExploresForProject(
                { ...enabledConfig, allowMultiOrgs: true },
                enabledProject,
            ),
        ).toEqual([]);
    });

    it('returns nothing when the project toggle is off', () => {
        expect(
            getSystemExploresForProject(enabledConfig, {
                ...enabledProject,
                systemExploresEnabled: false,
            }),
        ).toEqual([]);
    });
});
