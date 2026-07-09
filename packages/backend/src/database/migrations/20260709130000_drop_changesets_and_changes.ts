import { Knex } from 'knex';

const ChangesetsTableName = 'changesets';
const ChangesTableName = 'changes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ChangesTableName);
    await knex.schema.dropTableIfExists(ChangesetsTableName);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ChangesetsTableName))) {
        await knex.schema.createTable(ChangesetsTableName, (table) => {
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
            table
                .uuid('change_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
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
            table
                .uuid('changeset_uuid')
                .notNullable()
                .references('changeset_uuid')
                .inTable(ChangesetsTableName)
                .onDelete('CASCADE');
            table.uuid('source_prompt_uuid').nullable();
            table.string('entity_type').notNullable();
            table.string('entity_table_name').notNullable();
            table.string('entity_name').notNullable();
            table.string('type').notNullable();
            table.jsonb('payload').notNullable();
            table.index('changeset_uuid');
        });
    }
}
