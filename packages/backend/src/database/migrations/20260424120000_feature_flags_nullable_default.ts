import { type Knex } from 'knex';
import { FeatureFlagsTableName } from '../entities/featureFlags';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable(FeatureFlagsTableName, (table) => {
        table.boolean('default_enabled').nullable().alter();
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex(FeatureFlagsTableName)
        .whereNull('default_enabled')
        .update({ default_enabled: false });
    await knex.schema.alterTable(FeatureFlagsTableName, (table) => {
        table.boolean('default_enabled').notNullable().alter();
    });
};
