import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds new AI policy, principal and audit tables without changing existing data',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('ai_access_policies', (table) => {
        table
            .uuid('ai_access_policy_uuid')
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
            .uuid('warehouse_connection_uuid')
            .nullable()
            .references('warehouse_connection_uuid')
            .inTable('warehouse_connections')
            .onDelete('CASCADE')
            .index();
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('principal_kind').notNullable().defaultTo('group');
        table.check("principal_kind IN ('person','twin','group','shared')");
        table
            .jsonb('transport')
            .notNullable()
            .defaultTo(knex.raw('\'{"kind":"direct"}\'::jsonb'));
        table.text('shared_ref').nullable();
        table.text('twin_name_template').nullable();
        table.jsonb('policy_source').nullable();
        table.timestamps(true, true);
    });
    await knex.schema.createTable('ai_principal_group_mappings', (table) => {
        table
            .uuid('ai_principal_group_mapping_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_access_policy_uuid')
            .notNullable()
            .references('ai_access_policy_uuid')
            .inTable('ai_access_policies')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('group_uuid')
            .notNullable()
            .references('group_uuid')
            .inTable('groups')
            .onDelete('CASCADE')
            .index();
        table.text('ref').notNullable();
        table.integer('priority').notNullable().defaultTo(0);
        table.unique(['ai_access_policy_uuid', 'group_uuid']);
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.createTable('ai_principals', (table) => {
        table
            .uuid('ai_principal_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_access_policy_uuid')
            .notNullable()
            .references('ai_access_policy_uuid')
            .inTable('ai_access_policies')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('group_uuid')
            .nullable()
            .references('group_uuid')
            .inTable('groups')
            .onDelete('SET NULL')
            .index();
        table.text('kind').notNullable();
        table.check("kind IN ('person','twin','group','shared')");
        table.text('ref').notNullable();
        table.text('status').notNullable().defaultTo('pending');
        table.check("status IN ('pending','ready','failed')");
        table.text('failure_reason').nullable();
        table.text('status_message').nullable();
        table.jsonb('last_probe').nullable();
        table.text('public_key').nullable();
        table.text('public_key_fingerprint').nullable();
        table.binary('encrypted_secret').nullable();
        table.timestamps(true, true);
        table.unique(['ai_access_policy_uuid', 'ref'], {
            indexName: 'ai_principals_policy_ref_unique',
        });
        table.index(['ai_access_policy_uuid', 'status']);
    });
    await knex.schema.createTable('ai_query_audit', (table) => {
        table.uuid('query_uuid').primary();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('ai_principal_uuid')
            .nullable()
            .references('ai_principal_uuid')
            .inTable('ai_principals')
            .onDelete('SET NULL')
            .index();
        table.uuid('warehouse_connection_uuid').nullable();
        table.text('principal_kind').notNullable();
        table.text('principal_ref').notNullable();
        table.jsonb('transport').notNullable();
        table.boolean('probe_ok').notNullable();
        table.timestamp('probe_checked_at', { useTz: true }).nullable();
        table.text('person_tag').notNullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.raw(
        'CREATE UNIQUE INDEX ai_access_policies_original_connection_unique ON ai_access_policies (project_uuid) WHERE warehouse_connection_uuid IS NULL',
    );
    await knex.raw(
        'CREATE UNIQUE INDEX ai_access_policies_extra_connection_unique ON ai_access_policies (project_uuid, warehouse_connection_uuid) WHERE warehouse_connection_uuid IS NOT NULL',
    );
    await knex.raw(
        'CREATE UNIQUE INDEX ai_principals_policy_user_unique ON ai_principals (ai_access_policy_uuid, user_uuid) WHERE user_uuid IS NOT NULL',
    );
    await knex.raw(
        'CREATE INDEX ai_query_audit_project_created_idx ON ai_query_audit (project_uuid, created_at DESC)',
    );
}
export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_query_audit');
    await knex.schema.dropTable('ai_principals');
    await knex.schema.dropTable('ai_principal_group_mappings');
    await knex.schema.dropTable('ai_access_policies');
}
