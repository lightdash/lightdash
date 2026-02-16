import { Knex } from 'knex';

const METRICS_TREES_TABLE = 'metrics_trees';
const METRICS_TREE_NODES_TABLE = 'metrics_tree_nodes';
const PROJECTS_TABLE = 'projects';
const USERS_TABLE = 'users';
const CATALOG_SEARCH_TABLE = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(METRICS_TREES_TABLE, (table) => {
        table.uuid('metrics_tree_uuid').primary().defaultTo(knex.fn.uuid());
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');
        table.string('slug', 255).notNullable();
        table.string('name', 255).notNullable();
        table.text('description').nullable();
        table
            .string('source', 10)
            .notNullable()
            .defaultTo('ui')
            .comment('Source of the tree: yaml or ui');
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL');
        table
            .uuid('updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['project_uuid', 'slug']);
        table.index('project_uuid');
        table.index(['project_uuid', 'source']);
    });

    await knex.schema.createTable(METRICS_TREE_NODES_TABLE, (table) => {
        table
            .uuid('metrics_tree_uuid')
            .notNullable()
            .references('metrics_tree_uuid')
            .inTable(METRICS_TREES_TABLE)
            .onDelete('CASCADE');
        table
            .uuid('catalog_search_uuid')
            .notNullable()
            .references('catalog_search_uuid')
            .inTable(CATALOG_SEARCH_TABLE)
            .onDelete('CASCADE');
        table.double('x_position').nullable();
        table.double('y_position').nullable();
        table
            .string('source', 10)
            .notNullable()
            .defaultTo('ui')
            .comment('Source of the node: yaml or ui');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.primary(['metrics_tree_uuid', 'catalog_search_uuid']);
        table.index('metrics_tree_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(METRICS_TREE_NODES_TABLE);
    await knex.schema.dropTableIfExists(METRICS_TREES_TABLE);
}
