import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import Logger from '../../../logging/logger';
import { AgentConnectionApprovalRequestModel } from '../../../models/AgentConnectionApprovalRequestModel';
import {
    approvalRequestCleanupWorker,
    runApprovalRequestCleanup,
} from '../../../testing/agentApprovalRequestCleanup.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

const table = 'agent_connection_approval_requests';
const idColumn = 'agent_connection_approval_request_uuid';
let migrated: MigratedDatabase;
let second: Knex;
let organizationUuid: string;
let userUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    second = knex({
        client: 'pg',
        connection: migrated.connectionUri,
        pool: { min: 0, max: 2 },
    });
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Approval cleanup test' })
        .returning('organization_uuid');
    organizationUuid = org.organization_uuid;
    const [user] = await migrated
        .database('users')
        .insert({ first_name: 'Cleanup', last_name: 'Subject' } as never)
        .returning('user_uuid');
    userUuid = user.user_uuid;
});

afterAll(async () => {
    await second?.destroy();
    await migrated?.destroy();
});

beforeEach(async () => {
    await migrated.database(table).del();
    vi.spyOn(Logger, 'info').mockImplementation(() => Logger);
});

afterEach(() => vi.restoreAllMocks());

const row = (minutesUntilExpiry: number) => ({
    [idColumn]: randomUUID(),
    organization_uuid: organizationUuid,
    subject_user_uuid: userUuid,
    client_id: 'lightdash-cli',
    name: 'cleanup-sentinel',
    redirect_uri: 'http://localhost:34123/sensitive-callback',
    state: 'sensitive-state-sentinel'.repeat(2),
    code_challenge: 'x'.repeat(43),
    resource: 'https://server.example',
    requested_capabilities: '[]',
    expires_in_seconds: 900,
    created_at: new Date(Date.now() + (minutesUntilExpiry - 15) * 60000),
    request_expires_at: new Date(Date.now() + minutesUntilExpiry * 60000),
});

const insertExpired = async (count: number): Promise<string[]> => {
    const rows = Array.from({ length: count }, () => row(-90));
    await migrated.database.batchInsert(table, rows, 500);
    return rows.map((value) => value[idColumn]);
};

const remainingIds = async (): Promise<string[]> =>
    (await migrated.database(table).pluck(idColumn)).sort();

const setup = (database = migrated.database, maxBatches?: number) => {
    const model = new AgentConnectionApprovalRequestModel({ database });
    const purge = vi.spyOn(model, 'deleteExpiredBatch');
    const worker = approvalRequestCleanupWorker(model, maxBatches);
    return { purge, run: () => runApprovalRequestCleanup(worker) };
};

test('keeps the exact live, recently expired and decided-but-unexpired rows', async () => {
    const expired = row(-90);
    const recent = row(-30);
    const live = row(15);
    const decided = {
        ...row(15),
        review_revision: 1,
        review_session_hash: Buffer.alloc(32, 1),
        csrf_hash: Buffer.alloc(32, 2),
        displayed_selection: JSON.stringify({
            approvedProjectUuids: [],
            approvedCapabilities: [],
            resourceConstraints: { version: 2, projectCapabilities: {} },
        }),
        displayed_policy_version: 0,
        decision_consumed_at: new Date(),
        terminal_error: 'access_denied',
    };
    await migrated.database(table).insert([expired, recent, live, decided]);
    const job = setup();
    await job.run();
    expect(await remainingIds()).toEqual(
        [recent[idColumn], live[idColumn], decided[idColumn]].sort(),
    );
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 1. Batches: 1. Batch cap hit: false',
    );
});

test('deletes 2500 expired rows in three batches in one run', async () => {
    await insertExpired(2500);
    const job = setup();
    await job.run();
    expect(await remainingIds()).toEqual([]);
    expect(job.purge.mock.calls).toEqual([[1000], [1000], [1000]]);
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 2500. Batches: 3. Batch cap hit: false',
    );
});

test('stops at the injected cap and finishes the remaining rows next run', async () => {
    const ids = await insertExpired(2500);
    const job = setup(migrated.database, 2);
    await job.run();
    const remaining = await remainingIds();
    expect(remaining).toHaveLength(500);
    expect(remaining.every((id) => ids.includes(id))).toBe(true);
    expect(job.purge.mock.calls).toEqual([[1000], [1000]]);
    expect(Logger.info).toHaveBeenLastCalledWith(
        'Agent connection approval requests cleanup completed. Deleted: 2000. Batches: 2. Batch cap hit: true',
    );
    await job.run();
    expect(await remainingIds()).toEqual([]);
    expect(job.purge).toHaveBeenCalledTimes(3);
    expect(Logger.info).toHaveBeenLastCalledWith(
        'Agent connection approval requests cleanup completed. Deleted: 500. Batches: 1. Batch cap hit: false',
    );
});

test('two concurrent runs select and delete each expired id exactly once', async () => {
    const ids = await insertExpired(2500);
    const selected: string[] = [];
    const listener = (
        result: Record<string, string>[],
        query: { sql: string },
    ) => {
        if (query.sql.startsWith('select') && query.sql.includes('for update'))
            selected.push(...result.map((value) => value[idColumn]));
    };
    migrated.database.on('query-response', listener);
    second.on('query-response', listener);
    const left = setup();
    const right = setup(second);
    try {
        await Promise.all([left.run(), right.run()]);
    } finally {
        migrated.database.removeListener('query-response', listener);
        second.removeListener('query-response', listener);
    }
    expect(selected.sort()).toEqual(ids.sort());
    expect(await remainingIds()).toEqual([]);
    const counts = await Promise.all(
        [...left.purge.mock.results, ...right.purge.mock.results].map(
            (result) => result.value as Promise<number>,
        ),
    );
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(2500);
    expect(Logger.info).toHaveBeenCalledTimes(2);
});

test('skips a locked expired row and deletes it on the next run', async () => {
    const ids = await insertExpired(2);
    const holder = await migrated.database.transaction();
    try {
        await holder(table).where(idColumn, ids[0]).forUpdate().first();
        const job = setup(second);
        await second.raw("SET statement_timeout = '2s'");
        await job.run();
        expect(await remainingIds()).toEqual([ids[0]]);
        await holder.commit();
        await job.run();
        expect(await remainingIds()).toEqual([]);
    } finally {
        if (!holder.isCompleted()) await holder.rollback();
        await second.raw('RESET statement_timeout');
    }
});

test('an empty table costs exactly BEGIN, one locking select and COMMIT', async () => {
    const statements: string[] = [];
    const listener = (query: { sql: string }) => statements.push(query.sql);
    const job = setup();
    migrated.database.on('query', listener);
    try {
        await job.run();
    } finally {
        migrated.database.removeListener('query', listener);
    }
    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe('BEGIN;');
    expect(statements[1]).toMatch(
        /^select .*agent_connection_approval_requests.*for update skip locked$/,
    );
    expect(statements[2]).toBe('COMMIT;');
    expect(job.purge).toHaveBeenCalledExactlyOnceWith(1000);
    expect(await remainingIds()).toEqual([]);
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 0. Batches: 1. Batch cap hit: false',
    );
});
