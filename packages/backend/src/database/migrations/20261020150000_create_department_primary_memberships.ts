import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates one empty table for the department a person counts in, without reading or rewriting existing rows',
} as const;

const PRIMARY_MEMBERSHIPS = 'department_primary_memberships';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.createTable(PRIMARY_MEMBERSHIPS, (table) => {
        // Covered by the primary key, which leads with this column
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        // Deleting the department drops the primary, so the person counts in every department again
        table
            .uuid('department_uuid')
            .notNullable()
            .references('department_uuid')
            .inTable('organization_departments')
            .onDelete('CASCADE')
            .index();
        // At most one primary per person in an organization
        table.primary(['organization_uuid', 'user_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(PRIMARY_MEMBERSHIPS);
}
