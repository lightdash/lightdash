// Run: set -a; source .motherduck.env; set +a; pnpm -F warehouses exec vitest run src/warehouseClients/MotherduckInstancePool.integration.test.ts

import { DuckDBInstance } from '@duckdb/node-api';
import { randomUUID } from 'crypto';
import * as MotherduckInstancePool from './MotherduckInstancePool';

type DuckdbInstance = Awaited<ReturnType<typeof DuckDBInstance.create>>;
type DuckdbConnection = Awaited<ReturnType<DuckdbInstance['connect']>>;

const motherduckToken = process.env.MOTHERDUCK_TOKEN?.trim();
const database = 'jaffle_shop';
const query = 'SELECT * FROM jaffle_shop.jaffle.orders LIMIT 10';
const tablePrefix = 'ld_spk822_catalog_freshness_';
const ownedTablePattern =
    /^ld_spk822_catalog_freshness_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/;

const getConnectionString = () => {
    if (!motherduckToken) {
        throw new Error('MOTHERDUCK_TOKEN is required');
    }
    return `md:${database}?${new URLSearchParams({
        motherduck_token: motherduckToken,
        saas_mode: 'true',
    }).toString()}`;
};

const closeConnection = (connection: DuckdbConnection) => {
    connection.closeSync?.();
    connection.disconnectSync?.();
};

const consumeQuery = async (connection: DuckdbConnection, sql: string) => {
    const result = await connection.stream(sql);
    const rows: Record<string, unknown>[] = [];
    for await (const chunk of result.yieldRowObjectJson()) {
        rows.push(...chunk);
    }
    return rows;
};

const withFreshInstance = async <T>(
    callback: (connection: DuckdbConnection) => Promise<T>,
) => {
    const instance = await DuckDBInstance.create(getConnectionString());
    const connection = await instance.connect();
    try {
        return await callback(connection);
    } finally {
        closeConnection(connection);
        instance.closeSync?.();
    }
};

const measureFreshInstance = async () => {
    const startedAt = performance.now();
    await withFreshInstance(async (connection) =>
        consumeQuery(connection, query),
    );
    return performance.now() - startedAt;
};

const measureHeldInstance = async (instance: DuckdbInstance) => {
    const startedAt = performance.now();
    const connection = await instance.connect();
    try {
        await consumeQuery(connection, query);
        return performance.now() - startedAt;
    } finally {
        closeConnection(connection);
    }
};

const median = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = sorted[Math.floor(sorted.length / 2)];
    if (middle === undefined) {
        throw new Error('Cannot calculate the median of an empty set');
    }
    return middle;
};

describe.skipIf(!motherduckToken)(
    'MotherDuck instance pool live integration',
    () => {
        let createdTableName: string | undefined;

        beforeEach(() => {
            MotherduckInstancePool.resetForTesting();
            MotherduckInstancePool.configure({
                idleTtlMs: 60_000,
                maxAgeMs: 60_000,
                maxEntries: 1,
            });
        });

        afterEach(async () => {
            await MotherduckInstancePool.closeAll('shutdown');
            if (createdTableName) {
                if (!ownedTablePattern.test(createdTableName)) {
                    throw new Error('Refusing to clean up an unowned table');
                }
                await withFreshInstance(async (connection) => {
                    await connection.run(
                        `DROP TABLE main."${createdTableName}"`,
                    );
                });
                createdTableName = undefined;
            }
        });

        it('keeps a held instance fresh for a table and column created after warmup', async () => {
            const tableName = `${tablePrefix}${randomUUID().replaceAll('-', '_')}`;

            await MotherduckInstancePool.withInstance(
                getConnectionString(),
                {},
                async (instance) => {
                    const warmConnection = await instance.connect();
                    try {
                        await consumeQuery(
                            warmConnection,
                            'SELECT * FROM information_schema.columns LIMIT 1',
                        );
                        await withFreshInstance(async (connection) => {
                            await connection.run(
                                `CREATE TABLE main."${tableName}" (initial_column INTEGER)`,
                            );
                            createdTableName = tableName;
                            await connection.run(
                                `ALTER TABLE main."${tableName}" ADD COLUMN added_column VARCHAR`,
                            );
                        });

                        const columnsSql = `SELECT column_name FROM information_schema.columns WHERE table_catalog = '${database}' AND table_schema = 'main' AND table_name = '${tableName}' ORDER BY ordinal_position`;
                        const warmRows = await consumeQuery(
                            warmConnection,
                            columnsSql,
                        );
                        const freshConnection = await instance.connect();
                        try {
                            const freshRows = await consumeQuery(
                                freshConnection,
                                columnsSql,
                            );
                            expect(warmRows).toEqual([
                                { column_name: 'initial_column' },
                                { column_name: 'added_column' },
                            ]);
                            expect(freshRows).toEqual(warmRows);
                        } finally {
                            closeConnection(freshConnection);
                        }
                    } finally {
                        closeConnection(warmConnection);
                    }
                },
            );
        }, 60_000);

        it('keeps held-instance query cost several times below fresh-instance cost', async () => {
            const freshInstanceMs: number[] = [];
            const heldInstanceMs: number[] = [];

            await MotherduckInstancePool.withInstance(
                getConnectionString(),
                {},
                async (instance) => {
                    await measureHeldInstance(instance);
                    const collectMeasurements = async (
                        remaining: number,
                    ): Promise<void> => {
                        if (remaining === 0) {
                            return;
                        }
                        freshInstanceMs.push(await measureFreshInstance());
                        heldInstanceMs.push(
                            await measureHeldInstance(instance),
                        );
                        await collectMeasurements(remaining - 1);
                    };
                    await collectMeasurements(3);
                },
            );

            // A 3x threshold catches loss of instance reuse while leaving headroom for observed cross-run variance.
            expect(
                median(freshInstanceMs) / median(heldInstanceMs),
            ).toBeGreaterThanOrEqual(3);
        }, 60_000);
    },
);
