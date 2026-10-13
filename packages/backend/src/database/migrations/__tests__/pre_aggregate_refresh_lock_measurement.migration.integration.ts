import { type Knex } from 'knex';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { explore } from './launch-measurements/fixture.mock';
import { stats } from './launch-measurements/metrics';
import { transactionFixture } from './preAggregateRefreshTransaction.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
const results: unknown[] = [];
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
afterAll(async () => {
    await migrated?.destroy();
    if (process.env.X1S2_PHASE)
        await writeFile(
            `/Users/charlie/.scratch/spk2707/x1s2-${process.env.X1S2_PHASE}-lock-measurements.json`,
            JSON.stringify(
                {
                    head: execFileSync('git', ['rev-parse', 'HEAD'], {
                        encoding: 'utf8',
                    }).trim(),
                    results,
                },
                null,
                2,
            ),
        );
});
afterEach(() => vi.restoreAllMocks());

test.each(
    [10, 100, 500, 2000].flatMap((count) =>
        ['array', 'stream'].map((operation) => ({ count, operation })),
    ),
)('lock to commit: $operation $count', async ({ count, operation }) => {
    const incoming = Array.from({ length: count }, (_, index) =>
        explore(index),
    );
    const f = await transactionFixture(migrated.database, operation, incoming);
    await f.save(incoming);
    const samples: { hold: number; stored: number; staged: number }[] = [];
    const client = Object.getPrototypeOf(
        migrated.database.client,
    ) as Knex.Client;
    const { query } = client;
    for await (const run of Array.from({ length: 7 }, (_, index) => index)) {
        let lockedAt: number | undefined;
        let lockConnection: unknown;
        const sample = { hold: 0, stored: 0, staged: 0 };
        const spy = vi
            .spyOn(client, 'query')
            .mockImplementation(
                async function measuredQuery(
                    this: Knex.Client,
                    connection,
                    statement,
                ) {
                    const sql =
                        typeof statement === 'string'
                            ? statement
                            : statement.sql;
                    const started = performance.now();
                    const value = await query.call(this, connection, statement);
                    const finished = performance.now();
                    if (/from "cached_explores".*for update/.test(sql)) {
                        lockedAt = finished;
                        lockConnection = connection;
                    }
                    if (
                        lockedAt !== undefined &&
                        connection === lockConnection
                    ) {
                        if (sql.includes('hasMalformedPreAggregates')) {
                            if (sql.includes('cached_explore_staging'))
                                sample.staged += finished - started;
                            else sample.stored += finished - started;
                        }
                        if (/^COMMIT/i.test(sql))
                            sample.hold = finished - lockedAt;
                    }
                    return value;
                },
            );
        try {
            await agentExecutionContext.run(f.scope, f.run);
        } finally {
            spy.mockRestore();
        }
        expect(sample.hold).toBeGreaterThan(0);
        if (run >= 2) samples.push(sample);
    }
    results.push({
        operation,
        count,
        runs: samples.length,
        hold: stats(samples.map((sample) => sample.hold)),
        stored: stats(samples.map((sample) => sample.stored)),
        staged: stats(samples.map((sample) => sample.staged)),
        guard: stats(samples.map((sample) => sample.stored + sample.staged)),
    });
});
