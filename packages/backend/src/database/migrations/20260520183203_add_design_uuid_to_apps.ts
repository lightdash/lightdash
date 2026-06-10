import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table
            .uuid('design_uuid')
            .nullable()
            .references('design_uuid')
            .inTable('organization_designs')
            .onDelete('SET NULL')
            .index();
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('apps', (table) => {
        table.dropColumn('design_uuid');
    });
};
