import { Knex } from 'knex';

const RolesTableName = 'roles';
const ScopedRolesTableName = 'scoped_roles';
const OrgMembershipsTableName = 'organization_memberships';
const ProjectMembershipsTableName = 'project_memberships';
const ProjectGroupAccessTableName = 'project_group_access';

const addRoleUuidTo = async (knex: Knex, tableName: string) => {
    if (!(await knex.schema.hasColumn(tableName, 'role_uuid'))) {
        await knex.schema.alterTable(tableName, (table) => {
            table
                .uuid('role_uuid')
                .nullable()
                .references('role_uuid')
                .inTable('roles')
                // Prevent deleting a role if assigned to a user
                .onDelete('RESTRICT');
        });
    }
};

export async function up(knex: Knex): Promise<void> {
    // Create roles table
    await knex.schema.createTable(RolesTableName, (rolesTable) => {
        rolesTable
            .uuid('role_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        rolesTable.string('name').notNullable();
        rolesTable.text('description').nullable();
        rolesTable
            .uuid('organization_uuid')
            .nullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');

        rolesTable
            .uuid('created_by')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        rolesTable.string('owner_type').notNullable().defaultTo('user');
        rolesTable.timestamp('created_at').defaultTo(knex.fn.now());
        rolesTable.timestamp('updated_at').defaultTo(knex.fn.now());

        rolesTable.unique(['name', 'organization_uuid']);
        rolesTable.index('organization_uuid');
    });

    // 'user' roles must have an organization_uuid, 'system' roles defined by Lightdash must not
    await knex.raw(`
        ALTER TABLE roles
            ADD CONSTRAINT user_roles_need_org
                CHECK (
                    (owner_type = 'user' AND organization_uuid IS NOT NULL) OR
                    (owner_type = 'system' AND organization_uuid IS NULL)
                )
    `);

    await Promise.all([
        addRoleUuidTo(knex, OrgMembershipsTableName),
        addRoleUuidTo(knex, ProjectMembershipsTableName),
        addRoleUuidTo(knex, ProjectGroupAccessTableName),
    ]);

    // Create scoped_roles join table
    await knex.schema.createTable(ScopedRolesTableName, (scopedRolesTable) => {
        scopedRolesTable
            .uuid('role_uuid')
            .notNullable()
            .references('role_uuid')
            .inTable('roles')
            .onDelete('CASCADE');
        scopedRolesTable.string('scope_name').notNullable();
        scopedRolesTable.timestamp('granted_at').defaultTo(knex.fn.now());
        scopedRolesTable
            .uuid('granted_by')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');

        scopedRolesTable.primary(['role_uuid', 'scope_name']);
        scopedRolesTable.index('role_uuid');
        scopedRolesTable.index('scope_name');
    });
}

const removeRoleUuidFrom = async (knex: Knex, tableName: string) => {
    if (await knex.schema.hasColumn(tableName, 'role_uuid')) {
        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn('role_uuid');
        });
    }
};

export async function down(knex: Knex): Promise<void> {
    await Promise.all([
        removeRoleUuidFrom(knex, OrgMembershipsTableName),
        removeRoleUuidFrom(knex, ProjectMembershipsTableName),
        removeRoleUuidFrom(knex, ProjectGroupAccessTableName),
    ]);

    await knex.schema.dropTableIfExists(ScopedRolesTableName);
    await knex.schema.dropTableIfExists(RolesTableName);
}
