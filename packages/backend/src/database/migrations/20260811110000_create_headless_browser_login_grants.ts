import { Knex } from 'knex';

const HeadlessBrowserLoginGrantsTableName = 'headless_browser_login_grants';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        HeadlessBrowserLoginGrantsTableName,
        (table) => {
            table.text('token_hash').primary();
            table
                .uuid('user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE')
                .index();
            table
                .timestamp('expires_at', { useTz: true })
                .notNullable()
                .index();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(HeadlessBrowserLoginGrantsTableName);
}
