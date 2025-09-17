import { Knex } from 'knex';

const tableName = 'organization_member_user_attributes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.text('value').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.string('value', 255).notNullable().alter();
    });
}
