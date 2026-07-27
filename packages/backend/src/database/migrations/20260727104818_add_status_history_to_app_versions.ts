import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('status_history').notNullable().defaultTo('[]');
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('status_history');
    });
};
