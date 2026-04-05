import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table.text('sandbox_id');
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table.dropColumn('sandbox_id');
    });
};
