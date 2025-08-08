import { Knex } from 'knex';
import { type DbScopeInsert } from '../entities/roles';

const ScopesTableName = 'scopes';
const RolesTableName = 'roles';
const ScopedRolesTableName = 'scoped_roles';

export async function up(knex: Knex): Promise<void> {
    // Create roles table
    await knex.schema.createTable(RolesTableName, (table) => {
        table
            .uuid('role_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('name', 100).notNullable();
        table.text('description').nullable();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('created_by')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        table.unique(['name', 'organization_uuid']);
    });

    // Create scopes table
    await knex.schema.createTable(ScopesTableName, (table) => {
        table
            .uuid('scope_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('resource', 100).notNullable();
        table.string('action', 50).notNullable();
        table.text('description').nullable();
        table.boolean('is_commercial').notNullable();
        table.specificType(
            'name',
            `text GENERATED ALWAYS AS (resource || ':' || action) STORED`,
        );
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.unique(['resource', 'action']);
    });

    // Create scoped_roles join table
    await knex.schema.createTable(ScopedRolesTableName, (table) => {
        table
            .uuid('role_uuid')
            .notNullable()
            .references('role_uuid')
            .inTable('roles')
            .onDelete('CASCADE');
        table
            .uuid('scope_uuid')
            .notNullable()
            .references('scope_uuid')
            .inTable('scopes')
            .onDelete('CASCADE');
        table.timestamp('granted_at').defaultTo(knex.fn.now());
        table
            .uuid('granted_by')
            .notNullable()
            .references('user_uuid')
            .inTable('users');

        table.index('role_uuid', 'idx_role_scopes_role');
        table.index('scope_uuid', 'idx_role_scopes_scope');
    });

    // Insert initial common scopes based on current permission system
    const initialScopes: DbScopeInsert[] = [
        // Organization permissions
        {
            resource: 'Organization',
            action: 'view',
            description: 'View organization details',
            is_commercial: false,
        },
        {
            resource: 'Organization',
            action: 'manage',
            description: 'Manage organization settings',
            is_commercial: false,
        },

        // Project permissions
        {
            resource: 'Project',
            action: 'view',
            description: 'View projects and content',
            is_commercial: false,
        },
        {
            resource: 'Project',
            action: 'manage',
            description: 'Manage projects and content',
            is_commercial: false,
        },

        // Dashboard permissions
        {
            resource: 'Dashboard',
            action: 'view',
            description: 'View dashboards and associated content',
            is_commercial: false,
        },
        {
            resource: 'Dashboard',
            action: 'manage',
            description: 'Manage dashboards and associated content',
            is_commercial: false,
        },

        // Chart permissions
        {
            resource: 'Explore',
            action: 'view',
            description: 'View charts',
            is_commercial: false,
        },
        {
            resource: 'Explore',
            action: 'manage',
            description: 'Manage charts',
            is_commercial: false,
        },

        // Space permissions
        {
            resource: 'Space',
            action: 'view',
            description: 'View spaces',
            is_commercial: false,
        },
        {
            resource: 'Space',
            action: 'manage',
            description: 'Manage spaces and associated content',
            is_commercial: false,
        },

        // Export permissions
        {
            resource: 'Export',
            action: 'csv',
            description: 'Export data as CSV',
            is_commercial: false,
        },
        {
            resource: 'Export',
            action: 'image',
            description: 'Export data as image',
            is_commercial: false,
        },
        {
            resource: 'Export',
            action: 'pdf',
            description: 'Export data as PDF',
            is_commercial: false,
        },
        {
            resource: 'AiAgent',
            action: 'view',
            description: 'View AI agents',
            is_commercial: true,
        },
    ];

    await knex(ScopesTableName).insert(initialScopes);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ScopedRolesTableName);
    await knex.schema.dropTableIfExists(ScopesTableName);
    await knex.schema.dropTableIfExists(RolesTableName);
}
