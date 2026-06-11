import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('resources');
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('resources');
    });
};
