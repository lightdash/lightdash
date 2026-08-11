import { type Knex } from 'knex';

const AppsTableName = 'apps';
const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table
            .uuid('app_uuid')
            .nullable()
            .references('app_id')
            .inTable(AppsTableName)
            .onDelete('CASCADE')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.dropColumn('app_uuid');
    });
}
