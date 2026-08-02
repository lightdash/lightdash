import { Knex } from 'knex';

const ANNOUNCEMENTS_TABLE = 'project_announcements';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
        table.text('category').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
        table.dropColumn('category');
    });
}
