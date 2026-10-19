import { type Knex } from 'knex';

const policyTable = 'organization_agent_capability_policies';
const matrixTable = 'organization_agent_system_role_capabilities';
const confirmationTable = 'agent_warehouse_restriction_confirmations';
const bindingGenerations = [
    ['warehouse_credentials', 'warehouse_credential_generation'],
    ['warehouse_connections', 'connection_credential_generation'],
    [
        'organization_warehouse_credentials',
        'organization_credential_generation',
    ],
] as const;
const defaultScopes = [
    'view:AgentReadDiscover',
    'view:AgentQuery',
    'view:AgentExport',
    'view:AgentRawSql',
];

export const classification = {
    kind: 'safe',
    reason: 'Adds agent policy and warehouse confirmation tables, nullable audit metadata, and four default capability scopes without changing existing permissions.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await bindingGenerations.reduce<Promise<void>>(
        async (previous, [name, column]) => {
            await previous;
            await knex.schema.alterTable(name, (table) => {
                table.integer(column).notNullable().defaultTo(0);
            });
        },
        Promise.resolve(),
    );
    await knex.schema.createTable(policyTable, (table) => {
        table
            .uuid('organization_uuid')
            .primary()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .text('mode')
            .notNullable()
            .defaultTo('legacy')
            .checkIn(['legacy', 'managed']);
        table.integer('version').notNullable().defaultTo(0);
        table.specificType('allowed_project_uuids', 'uuid[]').nullable();
        table
            .uuid('updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index('agent_capability_policy_updated_by_idx');
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.createTable(matrixTable, (table) => {
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .text('system_role')
            .notNullable()
            .checkIn([
                'member',
                'viewer',
                'interactive_viewer',
                'editor',
                'developer',
                'admin',
            ]);
        table
            .text('capability')
            .notNullable()
            .checkIn([
                'read_discover',
                'query',
                'raw_sql',
                'content_write',
                'delete',
                'publish',
                'deploy_upload',
                'dbt_writeback',
                'export',
                'administration',
                'external_tools',
            ]);
        table.primary(['organization_uuid', 'system_role', 'capability']);
    });
    await knex.schema.createTable(confirmationTable, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('binding_fingerprint').notNullable();
        table
            .uuid('confirmed_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index('agent_warehouse_confirmation_confirmed_by_idx');
        table
            .timestamp('confirmed_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable('agent_action_log', (table) => {
        table.text('capability').nullable();
        table.integer('policy_version').nullable();
    });
    await knex.raw(
        `
                INSERT INTO scoped_roles (role_uuid, scope_name, granted_by)
                SELECT roles.role_uuid, defaults.scope_name,
                    COALESCE(source.granted_by, roles.created_by)
                FROM roles
                CROSS JOIN (VALUES (?::text), (?::text), (?::text), (?::text)) AS defaults(scope_name)
                LEFT JOIN LATERAL (
                    SELECT granted_by FROM scoped_roles
                    WHERE scoped_roles.role_uuid = roles.role_uuid AND granted_by IS NOT NULL
                    ORDER BY granted_at, scope_name
                    LIMIT 1
                ) AS source ON true
                WHERE roles.owner_type = 'user'
                ON CONFLICT DO NOTHING
            `,
        defaultScopes,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await [...bindingGenerations]
        .reverse()
        .reduce<Promise<void>>(async (previous, [name, column]) => {
            await previous;
            await knex.schema.alterTable(name, (table) =>
                table.dropColumn(column),
            );
        }, Promise.resolve());
    await knex.schema.alterTable('agent_action_log', (table) => {
        table.dropColumns('capability', 'policy_version');
    });
    await knex('scoped_roles').whereIn('scope_name', defaultScopes).delete();
    await knex.schema.dropTable(confirmationTable);
    await knex.schema.dropTable(matrixTable);
    await knex.schema.dropTable(policyTable);
}
