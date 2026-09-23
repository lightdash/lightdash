import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { listMigrationFiles } from '../../migrationFiles';

describe('real-schema test database', () => {
    let first: MigratedDatabase;
    let second: MigratedDatabase;

    beforeAll(async () => {
        first = await createMigratedDatabase();
        second = await createMigratedDatabase();
    });

    afterAll(async () => {
        await first?.destroy();
        await second?.destroy();
    });

    test('applies every core and enterprise migration', async () => {
        const applied = await first
            .database('knex_migrations')
            .pluck<string[]>('name');

        expect(new Set(applied)).toEqual(
            new Set((await listMigrationFiles()).map(({ name }) => name)),
        );
    });

    test('applies the graphile worker migrations', async () => {
        const result = await first.database.raw<{ rowCount: number }>(
            `SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'graphile_worker' AND table_name = 'migrations'`,
        );

        expect(result.rowCount).toBe(1);
    });

    test('gives every caller its own database', async () => {
        await first.database('organizations').insert({
            organization_name: 'Real schema isolation',
        });

        await expect(
            second
                .database('organizations')
                .where('organization_name', 'Real schema isolation')
                .first(),
        ).resolves.toBeUndefined();
        expect(first.databaseName).not.toBe(second.databaseName);
    });
});
