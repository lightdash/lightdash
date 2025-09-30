import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('changes', (table) => {
        table.dropColumn('entity_explore_uuid');
        table.string('entity_table_name').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('changes', (table) => {
        table.dropColumn('entity_table_name');
        table.uuid('entity_explore_uuid').nullable();
        /**
         * We are not doing a data migration here because:
         * - no code is actually using the explore uuid column
         * - it's not trivial to get explore uuid from a name.
         */
    });
}
