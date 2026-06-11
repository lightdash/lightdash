import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table.text('template');
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table.dropColumn('template');
    });
};
