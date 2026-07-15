import { Knex } from 'knex';

const ASSIGNMENTS_TABLE = 'homepage_assignments';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ASSIGNMENTS_TABLE, (table) => {
        table
            .uuid('assignment_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('homepage_uuid')
            .notNullable()
            .references('homepage_uuid')
            .inTable('homepages')
            .onDelete('CASCADE')
            .index();
        table.text('target_type').notNullable();
        table
            .uuid('group_uuid')
            .nullable()
            .references('group_uuid')
            .inTable('groups')
            .onDelete('CASCADE');
        table.text('role').nullable();
        table.integer('priority').notNullable().defaultTo(0);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    // A group/role lands on exactly one homepage per project
    await knex.raw(`
        CREATE UNIQUE INDEX homepage_assignments_one_group_per_project
        ON homepage_assignments (project_uuid, group_uuid)
        WHERE target_type = 'group'
    `);
    await knex.raw(`
        CREATE UNIQUE INDEX homepage_assignments_one_role_per_project
        ON homepage_assignments (project_uuid, role)
        WHERE target_type = 'role'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ASSIGNMENTS_TABLE);
}
