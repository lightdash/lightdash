import { Knex } from 'knex';

const USER_ONBOARDING_TABLE = 'user_onboarding';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(USER_ONBOARDING_TABLE, (table) => {
        table
            .uuid('user_uuid')
            .primary()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .jsonb('completed_tours')
            .notNullable()
            .defaultTo(knex.raw("'{}'::jsonb"));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(USER_ONBOARDING_TABLE);
}
