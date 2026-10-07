import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates four empty department tables without reading or rewriting existing rows',
} as const;

const LOCK_TIMEOUT = '5s';
const DEPARTMENTS = 'organization_departments';
const LINKS = 'department_links';
const MEMBERS = 'department_members';
const OWNERS = 'department_owners';
const LINK_TYPES = ['group', 'space', 'project'];
const PRINCIPAL_TYPES = ['user', 'group'];

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(DEPARTMENTS, (table) => {
        table
            .uuid('department_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        // SET NULL is the fallback; the model re-parents children on delete
        table
            .uuid('parent_department_uuid')
            .nullable()
            .references('department_uuid')
            .inTable(DEPARTMENTS)
            .onDelete('SET NULL')
            .index();
        table.text('name').notNullable();
        table.integer('headcount').nullable();
        table.text('headcount_note').nullable();
        table.integer('target_active_users').nullable();
        table.date('target_date').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .uuid('updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.unique(['organization_uuid', 'name']);
    });

    await knex.schema.createTable(LINKS, (table) => {
        table
            .uuid('department_uuid')
            .notNullable()
            .references('department_uuid')
            .inTable(DEPARTMENTS)
            .onDelete('CASCADE')
            .index();
        table.text('link_type').notNullable().checkIn(LINK_TYPES);
        // Polymorphic, so no FK; reads inner-join the target table
        table.uuid('link_uuid').notNullable();
        table.primary(['link_type', 'link_uuid']);
    });

    await knex.schema.createTable(MEMBERS, (table) => {
        table
            .uuid('department_uuid')
            .notNullable()
            .references('department_uuid')
            .inTable(DEPARTMENTS)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.primary(['department_uuid', 'user_uuid']);
    });

    await knex.schema.createTable(OWNERS, (table) => {
        table
            .uuid('department_uuid')
            .notNullable()
            .references('department_uuid')
            .inTable(DEPARTMENTS)
            .onDelete('CASCADE')
            .index();
        table.text('principal_type').notNullable().checkIn(PRINCIPAL_TYPES);
        // Polymorphic, so no FK; reads inner-join users or groups
        table.uuid('principal_uuid').notNullable();
        table.integer('position').notNullable().defaultTo(0);
        table.primary(['department_uuid', 'principal_type', 'principal_uuid']);
        table.index(['principal_type', 'principal_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTableIfExists(OWNERS);
    await knex.schema.dropTableIfExists(MEMBERS);
    await knex.schema.dropTableIfExists(LINKS);
    await knex.schema.dropTableIfExists(DEPARTMENTS);
}
