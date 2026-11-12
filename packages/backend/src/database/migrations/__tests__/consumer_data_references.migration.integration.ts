import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261111104815_add_consumer_data_references_to_app_versions';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const readPoolTimeouts = async (): Promise<string[]> => {
    const { database } = migrated;
    // Hold several connections at once so the read covers more than one.
    const trxs = await Promise.all(
        Array.from({ length: 4 }, () => database.transaction()),
    );
    try {
        return await Promise.all(
            trxs.map(async (trx) => {
                const result = await trx.raw(
                    `SELECT current_setting('statement_timeout') AS value`,
                );
                return result.rows[0].value as string;
            }),
        );
    } finally {
        await Promise.all(trxs.map((trx) => trx.rollback()));
    }
};

describe('add_consumer_data_references_to_app_versions', () => {
    it('re-runs cleanly and leaves pooled connections at their timeout', async () => {
        const { database } = migrated;
        const before = await readPoolTimeouts();

        await down(database);
        await up(database);
        await up(database);

        expect(
            await database.schema.hasColumn(
                'app_versions',
                'consumer_data_references',
            ),
        ).toBe(true);
        expect(await readPoolTimeouts()).toEqual(before);
    });
});
