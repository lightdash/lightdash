import { type Knex } from 'knex';

export const createMigrateKnexConfig = (
    sharedConfig: Knex.Config,
): Knex.Config => ({
    ...sharedConfig,
    migrations: {
        ...sharedConfig.migrations,
        disableMigrationsListValidation: true,
    },
});
