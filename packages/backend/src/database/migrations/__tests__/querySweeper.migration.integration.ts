import { QueryHistoryStatus } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

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
        (query_uuid, organization_uuid, context, compiled_sql, metric_query, fields, request_parameters, cache_key, status, created_at, processing_started_at, executing_heartbeat_at)
        VALUES (?, ?, 'sqlRunner', 'select 1', '{}', '{}', '{}', ?, ?, ?, ?, ?)`,
        [
            queryUuid,
            organizationUuid,
            queryUuid,
            status,
            old,
            status === 'executing' ? old : null,
            heartbeat,
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
    const id = await insert('executing');
    await migrated
        .database('query_history')
        .where('query_uuid', id)
        .update({ processing_started_at: new Date() });
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
        (organization_uuid, context, compiled_sql, metric_query, fields, request_parameters, cache_key, status, created_at)
        SELECT ?, 'sqlRunner', 'select 1', '{}', '{}', '{}', n::text, 'queued', ?::timestamp
        FROM generate_series(1, 501) n`,
        [organizationUuid, old],
    );
    expect(await model.failStuckQueriesBatch(86400)).toBe(500);
    expect(await model.failStuckQueriesBatch(86400)).toBe(1);
    expect(await model.failStuckQueriesBatch(86400)).toBe(0);
});

it.each(['Pacific/Kiritimati', 'Etc/GMT+12'])(
    'uses UTC timestamps for liveness in session zone %s',
    async (timeZone) => {
        const live = [
            await insert('executing'),
            await insert('executing'),
            await insert('queued'),
        ];
        const stale = [
            await insert('executing'),
            await insert('executing'),
            await insert('queued'),
        ];
        await migrated.database.transaction(async (transaction) => {
            await transaction.raw("SELECT set_config('TimeZone', ?, true)", [
                timeZone,
            ]);
            const setAge = (ids: string[], ageHours: number) =>
                transaction.raw(
                    `UPDATE query_history
                     SET created_at = (now() - ? * interval '1 hour') AT TIME ZONE 'UTC',
                         processing_started_at = CASE WHEN status = 'executing'
                             THEN (now() - ? * interval '1 hour') AT TIME ZONE 'UTC'
                             ELSE NULL END,
                         executing_heartbeat_at = CASE WHEN query_uuid = ?
                             THEN now() - ? * interval '1 hour' ELSE NULL END
                     WHERE query_uuid IN (?, ?, ?)`,
                    [ageHours, ageHours, ids[0], ageHours, ...ids],
                );
            await setAge(live, 20);
            await setAge(stale, 30);
            const zonedModel = new QueryHistoryModel({ database: transaction });
            expect(await zonedModel.failStuckQueriesBatch(86400)).toBe(3);
            const liveRows = await transaction('query_history').whereIn(
                'query_uuid',
                live,
            );
            expect(liveRows.map((row) => row.status).sort()).toEqual([
                'executing',
                'executing',
                'queued',
            ]);
            const staleRows = await transaction('query_history').whereIn(
                'query_uuid',
                stale,
            );
            expect(staleRows.map((row) => row.status)).toEqual([
                'error',
                'error',
                'error',
            ]);
        });
    },
);
