import { Knex } from 'knex';

const METRICS_TREE_LOCKS_TABLE = 'metrics_tree_locks';
const METRICS_TREES_TABLE = 'metrics_trees';
const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(METRICS_TREE_LOCKS_TABLE, (table) => {
        table
            .uuid('metrics_tree_uuid')
            .primary()
            .references('metrics_tree_uuid')
            .inTable(METRICS_TREES_TABLE)
            .onDelete('CASCADE');
        table
            .uuid('locked_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('CASCADE');
        table
            .timestamp('acquired_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('last_heartbeat_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index('locked_by_user_uuid');
    });

    await knex.schema.alterTable(METRICS_TREES_TABLE, (table) => {
        table
            .integer('generation')
            .notNullable()
            .defaultTo(1)
            .comment(
                'Internal optimistic concurrency counter. Incremented on every update to detect stale drafts. Not exposed to users.',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREES_TABLE, (table) => {
        table.dropColumn('generation');
    });
    await knex.schema.dropTableIfExists(METRICS_TREE_LOCKS_TABLE);
}
