import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('projects', (table) => {
        table.string('scheduler_cjk_font').notNullable().defaultTo('');
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('scheduler_cjk_font');
    });
};
