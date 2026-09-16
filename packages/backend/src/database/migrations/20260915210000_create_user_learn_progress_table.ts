import { Knex } from 'knex';

const USER_LEARN_PROGRESS_TABLE = 'user_learn_progress';

/**
 * Learn walkthrough progress per user (CS-186). One row per user and scope:
 * when it was first and last started, and when it was completed, if ever.
 * The composite key is the natural one (both columns NOT NULL and stable)
 * and its leading column indexes the users foreign key.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.createTable(USER_LEARN_PROGRESS_TABLE, (table) => {
            table
                .uuid('user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');
            table.text('scope').notNullable();
            table
                .timestamp('first_started_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('last_started_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.timestamp('completed_at', { useTz: false }).nullable();
            table.primary(['user_uuid', 'scope']);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.dropTableIfExists(USER_LEARN_PROGRESS_TABLE);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
