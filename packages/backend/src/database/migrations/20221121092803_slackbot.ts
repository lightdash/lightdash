import { Knex } from 'knex';

const tableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .integer('organization_id')
                .notNullable()
                .references('organization_id')
                .inTable('organizations')
                .onDelete('CASCADE');
            tableBuilder.jsonb('installation');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
