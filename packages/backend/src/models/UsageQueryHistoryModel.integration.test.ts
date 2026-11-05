import {
    DefaultSupportedDbtVersion,
    ProjectType,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../testing/migratedDatabase';
import { UsageQueryHistoryModel } from './UsageQueryHistoryModel';

type ExportedQuery = {
    query_id: string;
    event_ts: string;
    status: 'success' | 'error';
    error: string | null;
};

describe('retained query history across bounded time windows (PostgreSQL)', () => {
    const before = '2019-01-01T04:00:00.123457Z';
    const queryUuid = (index: number) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    let migrated: MigratedDatabase;
    let organizationUuid: string;
    let model: UsageQueryHistoryModel;

    const collect = async (cutoff = before, org = organizationUuid) => {
        const records: ExportedQuery[] = [];
        for await (const line of model.getJsonLines(org, cutoff)) {
            try {
                records.push(JSON.parse(line) as ExportedQuery);
            } catch (error) {
                throw new Error('Backfill emitted invalid JSON', {
                    cause: error,
                });
            }
        }
        return records;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 1 });
        model = new UsageQueryHistoryModel(migrated.database);
        const organizations = await migrated
            .database('organizations')
            .insert([
                { organization_name: 'Historical backfill target' },
                { organization_name: 'Other historical tenant' },
            ])
            .returning(['organization_id', 'organization_uuid']);
        organizationUuid = organizations[0].organization_uuid;
        const projects = await migrated
            .database('projects')
            .insert(
                [
                    {
                        name: 'Retained history project',
                        organization_id: organizations[0].organization_id,
                        project_type: ProjectType.DEFAULT,
                    },
                    {
                        name: 'Preview history project',
                        organization_id: organizations[0].organization_id,
                        project_type: ProjectType.PREVIEW,
                    },
                    {
                        name: 'Other tenant project',
                        organization_id: organizations[1].organization_id,
                        project_type: ProjectType.DEFAULT,
                    },
                ].map((project) => ({
                    ...project,
                    dbt_connection: null,
                    dbt_connection_type: null,
                    copied_from_project_uuid: null,
                    dbt_version: DefaultSupportedDbtVersion,
                    organization_warehouse_credentials_uuid: null,
                    created_by_user_uuid: null,
                })),
            )
            .returning('project_uuid');
        const historyRow = (
            index: number,
            createdAt: string,
            status = QueryHistoryStatus.READY,
            org = organizationUuid,
            project: string | null = projects[0].project_uuid,
        ) => ({
            query_uuid: queryUuid(index),
            organization_uuid: org,
            project_uuid: project,
            created_at: createdAt,
            context: QueryExecutionContext.EXPLORE,
            compiled_sql: 'SELECT 1',
            metric_query: {},
            fields: {},
            request_parameters: {},
            status,
            cache_key: String(index),
            error:
                status === QueryHistoryStatus.ERROR ? 'Retained error' : null,
        });
        const rows = [
            historyRow(7000, '2019-01-01T00:00:00.000000Z'),
            ...Array.from({ length: 1005 }, (_, index) =>
                historyRow(1005 - index, '2019-01-01T00:30:00.123456Z'),
            ),
            historyRow(0, '2019-01-01T00:30:00.123457Z'),
            historyRow(1010, '2019-01-01T00:59:59.999999Z'),
            historyRow(
                2001,
                '2019-01-01T02:00:00.000000Z',
                QueryHistoryStatus.ERROR,
            ),
            historyRow(2002, '2019-01-01T02:30:00.000000Z'),
            historyRow(4001, '2019-01-01T04:00:00.123456Z'),
            historyRow(4002, before),
            historyRow(4003, '2019-01-01T04:00:00.123458Z'),
            historyRow(
                9000,
                '2019-01-01T02:15:00.000000Z',
                QueryHistoryStatus.READY,
                organizations[1].organization_uuid,
                projects[2].project_uuid,
            ),
            historyRow(
                9001,
                '2019-01-01T02:15:00.000000Z',
                QueryHistoryStatus.READY,
                organizationUuid,
                projects[2].project_uuid,
            ),
            historyRow(
                9002,
                '2019-01-01T02:15:00.000000Z',
                QueryHistoryStatus.READY,
                organizations[1].organization_uuid,
                projects[0].project_uuid,
            ),
            historyRow(
                9003,
                '2019-01-01T02:15:00.000000Z',
                QueryHistoryStatus.READY,
                organizationUuid,
                projects[1].project_uuid,
            ),
            historyRow(
                9004,
                '2019-01-01T02:15:00.000000Z',
                QueryHistoryStatus.READY,
                organizationUuid,
                null,
            ),
            ...[
                QueryHistoryStatus.PENDING,
                QueryHistoryStatus.QUEUED,
                QueryHistoryStatus.EXECUTING,
                QueryHistoryStatus.EXPIRED,
                QueryHistoryStatus.CANCELLED,
            ].map((status, index) =>
                historyRow(9100 + index, '2019-01-01T02:15:00.000000Z', status),
            ),
        ];
        await migrated.database.raw(
            `INSERT INTO query_history
                (query_uuid, organization_uuid, project_uuid, created_at,
                 context, compiled_sql, metric_query, fields,
                 request_parameters, status, cache_key, error)
             SELECT * FROM jsonb_to_recordset(?::jsonb) AS history(
                 query_uuid uuid, organization_uuid uuid, project_uuid uuid,
                 created_at timestamp, context text, compiled_sql text,
                 metric_query jsonb, fields jsonb, request_parameters jsonb,
                 status text, cache_key text, error text)`,
            [JSON.stringify(rows)],
        );
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('exports all eligible old history once across pages, empty hours and a precise cutoff', async () => {
        const records = await collect();
        expect(records.map(({ query_id }) => query_id)).toEqual(
            [
                7000,
                ...Array.from({ length: 1005 }, (_, index) => index + 1),
                0,
                1010,
                2001,
                2002,
                4001,
            ].map(queryUuid),
        );
        expect(new Set(records.map(({ query_id }) => query_id)).size).toBe(
            records.length,
        );
        expect(records[1005].event_ts).toBe('2019-01-01T00:30:00.123456Z');
        expect(records[1006].event_ts).toBe('2019-01-01T00:30:00.123457Z');
        expect(
            records.find(({ query_id }) => query_id === queryUuid(2001)),
        ).toMatchObject({
            status: 'error',
            error: 'Retained error',
        });
        expect(records[records.length - 1].event_ts).toBe(
            '2019-01-01T04:00:00.123456Z',
        );
    });

    test('returns no history when the cutoff precedes the oldest retained query', async () => {
        expect(await collect('2018-12-31T23:59:59.999999Z')).toEqual([]);
    });

    test('finishes when every time window is empty for the requested organization', async () => {
        expect(await collect(before, queryUuid(99999))).toEqual([]);
    });

    test('keeps the oldest hours when the server process uses a non-UTC timezone', async () => {
        vi.stubEnv('TZ', 'America/Los_Angeles');
        try {
            const records = await collect();
            expect(records).toHaveLength(1011);
            expect(records[0].event_ts).toBe('2019-01-01T00:00:00.000000Z');
        } finally {
            vi.unstubAllEnvs();
        }
    });
});
