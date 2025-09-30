import { Knex } from 'knex';

const ChangesetsTableName = 'changesets';
const ChangesTableName = 'changes';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ChangesetsTableName))) {
        await knex.schema.createTable(ChangesetsTableName, (table) => {
            table.comment(
                'Represents a collection of related changes made to a project',
            );
            table
                .uuid('changeset_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table
                .uuid('created_by_user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');

            table
                .uuid('updated_by_user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');

            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');

            table.string('status').notNullable();

            table.string('name').notNullable();

            table.index('project_uuid');
            table.index('status');
            table.index(['project_uuid', 'status']);
        });
    }

    if (!(await knex.schema.hasTable(ChangesTableName))) {
        await knex.schema.createTable(ChangesTableName, (table) => {
            table.comment(
                'Individual changes within a changeset, representing specific modifications to entities (table, metrics, dimensions)',
            );
            table
                .uuid('change_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('changeset_uuid')
                .notNullable()
                .references('changeset_uuid')
                .inTable('changesets')
                .onDelete('CASCADE');

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table
                .uuid('created_by_user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');

            table.uuid('source_prompt_uuid').nullable();

            table.string('type').notNullable();

            table.string('entity_type').notNullable();

            table
                .uuid('entity_explore_uuid')
                .nullable()
                .references('cached_explore_uuid')
                .inTable('cached_explore')
                .onDelete('SET NULL');

            table.string('entity_name').notNullable();

            table.jsonb('payload').notNullable();

            table.index('changeset_uuid');
            table.index('entity_explore_uuid');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ChangesTableName);
    await knex.schema.dropTableIfExists(ChangesetsTableName);
}
