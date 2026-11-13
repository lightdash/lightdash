import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type QueryHistory,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { buildAccount } from '../../../auth/account/account.mock';
import { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261113170000_add_query_creation_clock';

vi.mock('../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

let migrated: MigratedDatabase;
let model: QueryHistoryModel;
let organizationUuid: string;
const old = new Date(Date.now() - 172800_000);

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    model = new QueryHistoryModel({ database: migrated.database });
    const [organization] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Sweeper test' })
        .returning('organization_uuid');
    organizationUuid = organization.organization_uuid;
});
afterAll(async () => migrated?.destroy());
beforeEach(async () => {
    await migrated.database('query_history').delete();
});

const insert = async (status: string, heartbeat: Date | null = null) => {
    const queryUuid = randomUUID();
    await migrated.database.raw(
        `INSERT INTO query_history
        (query_uuid, organization_uuid, context, compiled_sql, metric_query, fields, request_parameters, cache_key, status, created_at, processing_started_at, executing_heartbeat_at, query_created_at_utc)
        VALUES (?, ?, 'sqlRunner', 'select 1', '{}', '{}', '{}', ?, ?, ?, ?, ?, ?)`,
        [
            queryUuid,
            organizationUuid,
            queryUuid,
            status,
            old,
            status === 'executing' ? old : null,
            heartbeat,
            old,
        ],
    );
    return queryUuid;
};

it.each(['queued', 'executing'])(
    'fails a stuck %s row with the exact error and timestamp',
    async (status) => {
        const id = await insert(status);
        expect(await model.failStuckQueriesBatch(86400)).toBe(1);
        expect(
            await migrated
                .database('query_history')
                .where('query_uuid', id)
                .first(),
        ).toMatchObject({
            status: 'error',
            error: 'This query was not picked up by a worker. Try again.',
            errored_at: expect.any(Date),
        });
    },
);

it('preserves live heartbeats and recent execution starts', async () => {
    await insert('executing', new Date());
    const id = await insert('queued');
    expect(await model.updateStatusToExecuting(id)).toBe(1);
    expect(await model.failStuckQueriesBatch(86400)).toBe(0);
});

it.each(['ready', 'error', 'cancelled', 'expired'])(
    'does not overwrite %s',
    async (status) => {
        const id = await insert(status);
        expect(await model.failStuckQueriesBatch(86400)).toBe(0);
        expect(
            (
                await migrated
                    .database('query_history')
                    .where('query_uuid', id)
                    .first()
            )?.status,
        ).toBe(status);
    },
);

it('does not overwrite a concurrent completion', async () => {
    const id = await insert('executing');
    const transaction = await migrated.database.transaction();
    try {
        await transaction('query_history')
            .where('query_uuid', id)
            .update({ status: QueryHistoryStatus.READY });
        expect(await model.failStuckQueriesBatch(86400)).toBe(0);
        await transaction.commit();
        expect(await model.failStuckQueriesBatch(86400)).toBe(0);
        expect(
            (
                await migrated
                    .database('query_history')
                    .where('query_uuid', id)
                    .first()
            )?.status,
        ).toBe('ready');
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
});

it('throttles heartbeat writes and only updates executing rows', async () => {
    const id = await insert('executing');
    expect(await model.updateExecutingHeartbeat(id)).toBe(1);
    expect(await model.updateExecutingHeartbeat(id)).toBe(0);
    const queued = await insert('queued');
    expect(await model.updateExecutingHeartbeat(queued)).toBe(0);
});

it('limits each update to 500 rows', async () => {
    await migrated.database.raw(
        `INSERT INTO query_history
        (organization_uuid, context, compiled_sql, metric_query, fields, request_parameters, cache_key, status, created_at, query_created_at_utc)
        SELECT ?, 'sqlRunner', 'select 1', '{}', '{}', '{}', n::text, 'queued', ?::timestamp, ?::timestamptz
        FROM generate_series(1, 501) n`,
        [organizationUuid, old, old],
    );
    expect(await model.failStuckQueriesBatch(86400)).toBe(500);
    expect(await model.failStuckQueriesBatch(86400)).toBe(1);
    expect(await model.failStuckQueriesBatch(86400)).toBe(0);
});

const createFromApi = async (queryModel: QueryHistoryModel) => {
    const result = await queryModel.create(
        buildAccount({ accountType: 'jwt' }),
        {
            organizationUuid,
            projectUuid: null,
            context: QueryExecutionContext.AI,
            compiledSql: 'SELECT 1',
            metricQuery: {} as QueryHistory['metricQuery'],
            fields: {},
            requestParameters: {} as QueryHistory['requestParameters'],
            usedParameters: null,
            cacheKey: randomUUID(),
            pivotConfiguration: null,
            originalColumns: null,
        },
    );
    expect(await queryModel.updateStatusToQueued(result.queryUuid)).toBe(1);
    return result.queryUuid;
};

it.each(['Europe/Berlin', 'Asia/Tokyo', 'America/Los_Angeles'])(
    'uses the database clock for real-model inserts in %s',
    async (timeZone) => {
        await migrated.database.transaction(async (transaction) => {
            await transaction.raw("SELECT set_config('TimeZone', ?, true)", [
                timeZone,
            ]);
            const zonedModel = new QueryHistoryModel({ database: transaction });
            const fresh = await createFromApi(zonedModel);
            const stale = await createFromApi(zonedModel);
            const executing = await createFromApi(zonedModel);
            await transaction.raw(
                `UPDATE query_history
                SET query_created_at_utc = now() - interval '20 minutes'
                WHERE query_uuid IN (?, ?)`,
                [stale, executing],
            );
            expect(await zonedModel.updateStatusToExecuting(executing)).toBe(1);
            const clock = await transaction.raw(
                `SELECT
                created_at = now()::timestamp AS created_uses_session_clock,
                query_created_at_utc = now() AS anchor_is_current
                FROM query_history WHERE query_uuid = ?`,
                [fresh],
            );
            expect(clock.rows[0]).toEqual({
                created_uses_session_clock: true,
                anchor_is_current: true,
            });
            const executionClock = await transaction.raw(
                `SELECT
                executing_heartbeat_at = now() AS heartbeat_is_current
                FROM query_history WHERE query_uuid = ?`,
                [executing],
            );
            expect(executionClock.rows[0]).toEqual({
                heartbeat_is_current: true,
            });
            expect(await zonedModel.updateExecutingHeartbeat(executing)).toBe(
                0,
            );
            expect(await zonedModel.failStuckQueriesBatch(900)).toBe(1);
            const rows = await transaction('query_history').whereIn(
                'query_uuid',
                [fresh, stale, executing],
            );
            expect(rows.find((row) => row.query_uuid === fresh)?.status).toBe(
                'queued',
            );
            expect(rows.find((row) => row.query_uuid === stale)?.status).toBe(
                'error',
            );
            expect(
                rows.find((row) => row.query_uuid === executing)?.status,
            ).toBe('executing');
            await transaction.raw(
                `UPDATE query_history
                SET executing_heartbeat_at = now() - interval '20 minutes'
                WHERE query_uuid = ?`,
                [executing],
            );
            expect(await zonedModel.failStuckQueriesBatch(900)).toBe(1);
            expect(
                (
                    await transaction('query_history')
                        .where('query_uuid', executing)
                        .first()
                )?.status,
            ).toBe('error');
        });
    },
);

it('adds the rollout grace period through metadata and preserves the creation default on rollback', async () => {
    await migrated.database.transaction(async (transaction) => {
        await transaction.raw("SET LOCAL TIME ZONE 'America/Los_Angeles'");
        await down(transaction);
        const legacyModel = new QueryHistoryModel({ database: transaction });
        const queued = await createFromApi(legacyModel);
        const executing = await createFromApi(legacyModel);
        expect(await legacyModel.updateStatusToExecuting(executing)).toBe(1);
        await transaction.raw(`UPDATE query_history
            SET created_at = created_at - interval '2 days',
                executing_heartbeat_at = CASE WHEN status = 'executing'
                    THEN now() - interval '2 days' ELSE NULL END`);
        const before = await transaction.raw(
            "SELECT relfilenode FROM pg_class WHERE oid = 'query_history'::regclass",
        );
        await up(transaction);
        const after = await transaction.raw(
            "SELECT relfilenode FROM pg_class WHERE oid = 'query_history'::regclass",
        );
        expect(after.rows).toEqual(before.rows);
        const metadata =
            await transaction.raw(`SELECT atthasmissing FROM pg_attribute
            WHERE attrelid = 'query_history'::regclass AND attname = 'query_created_at_utc'`);
        expect(metadata.rows[0].atthasmissing).toBe(true);
        const anchors = await transaction.raw(
            `SELECT query_created_at_utc = now() AS has_grace
            FROM query_history WHERE query_uuid IN (?, ?)`,
            [queued, executing],
        );
        expect(anchors.rows).toEqual([
            { has_grace: true },
            { has_grace: true },
        ]);
        expect(await legacyModel.failStuckQueriesBatch(900)).toBe(0);
        await transaction.raw(
            "UPDATE query_history SET query_created_at_utc = now() - interval '901 seconds'",
        );
        expect(await legacyModel.failStuckQueriesBatch(900)).toBe(2);
        await down(transaction);
        expect(
            await transaction.schema.hasColumn(
                'query_history',
                'query_created_at_utc',
            ),
        ).toBe(false);
        const reverted = await createFromApi(legacyModel);
        const defaults = await transaction.raw(
            `SELECT
            created_at = now()::timestamp AS uses_session_clock
            FROM query_history WHERE query_uuid = ?`,
            [reverted],
        );
        expect(defaults.rows[0].uses_session_clock).toBe(true);
        await up(transaction);
    });
});

it.each(['Europe/Berlin', 'Asia/Tokyo', 'America/Los_Angeles'])(
    'preserves the session-zone default and last-24-hours window in %s',
    async (timeZone) => {
        await migrated.database.transaction(async (transaction) => {
            await transaction.raw("SELECT set_config('TimeZone', ?, true)", [
                timeZone,
            ]);
            const zonedModel = new QueryHistoryModel({ database: transaction });
            const checkDefault = async (migrate: typeof up) => {
                await migrate(transaction);
                const id = await createFromApi(zonedModel);
                const clock = await transaction.raw(
                    `SELECT created_at = now()::timestamp AS uses_session_clock
                    FROM query_history WHERE query_uuid = ?`,
                    [id],
                );
                expect(clock.rows[0].uses_session_clock).toBe(true);
                await transaction.raw(
                    "UPDATE query_history SET created_at = created_at - interval '23 hours 59 minutes' WHERE query_uuid = ?",
                    [id],
                );
                const recent = () =>
                    transaction('query_history')
                        .where('query_uuid', id)
                        .whereRaw("created_at > now() - interval '24 hours'");
                expect(await recent()).toHaveLength(1);
                await transaction.raw(
                    "UPDATE query_history SET created_at = created_at - interval '2 minutes' WHERE query_uuid = ?",
                    [id],
                );
                expect(await recent()).toHaveLength(0);
            };
            await checkDefault(down);
            await checkDefault(up);
        });
    },
);

it.each(['executing', 'expired'])(
    'keeps the application-clock queue time when a row becomes %s',
    async (status) => {
        await migrated.database.transaction(async (transaction) => {
            await transaction.raw("SET LOCAL TIME ZONE 'Europe/Berlin'");
            const zonedModel = new QueryHistoryModel({ database: transaction });
            const id = await createFromApi(zonedModel);
            const createdAt = new Date();
            await transaction.raw(
                'UPDATE query_history SET created_at = ? WHERE query_uuid = ?',
                [createdAt, id],
            );
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(createdAt.getTime() + 300_000);
            try {
                expect(
                    status === 'executing'
                        ? await zonedModel.updateStatusToExecuting(id)
                        : await zonedModel.updateStatusToExpired(id, 'Expired'),
                ).toBe(1);
                const row = await transaction('query_history')
                    .where('query_uuid', id)
                    .first();
                if (!row?.processing_started_at) {
                    throw new Error('Expected a processing start time');
                }
                expect(
                    Math.round(
                        row.processing_started_at.getTime() -
                            row.created_at.getTime(),
                    ),
                ).toBe(300_000);
            } finally {
                vi.useRealTimers();
            }
        });
    },
);
