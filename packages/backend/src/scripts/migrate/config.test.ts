import { type Knex } from 'knex';
import { createMigrateKnexConfig } from './config';

describe('createMigrateKnexConfig', () => {
    test('disables migration list validation without mutating the shared config', () => {
        const sharedMigrations: Knex.MigratorConfig = {
            directory: '/migrations',
            disableMigrationsListValidation: false,
        };
        const sharedConfig: Knex.Config = {
            client: 'pg',
            migrations: sharedMigrations,
        };

        const migrateConfig = createMigrateKnexConfig(sharedConfig);

        expect(migrateConfig).not.toBe(sharedConfig);
        expect(migrateConfig.migrations).not.toBe(sharedMigrations);
        expect(migrateConfig.migrations).toEqual({
            directory: '/migrations',
            disableMigrationsListValidation: true,
        });
        expect(sharedConfig.migrations).toBe(sharedMigrations);
        expect(sharedConfig.migrations?.disableMigrationsListValidation).toBe(
            false,
        );
    });
});
