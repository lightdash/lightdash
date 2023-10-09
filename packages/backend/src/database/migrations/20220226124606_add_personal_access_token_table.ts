import { Knex } from 'knex';

const tableName = 'personal_access_tokens';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .uuid('personal_access_token_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            tableBuilder
                .integer('created_by_user_id')
                .notNullable()
                .references('user_id')
                .inTable('users')
                .onDelete('CASCADE');
            tableBuilder.text('description').notNullable();
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.text('token_hash').notNullable();
            tableBuilder.timestamp('expires_at', { useTz: false }).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
