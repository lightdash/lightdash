import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a separate agent grant table with a generated UUID default and indexed foreign keys without changing existing credentials or permissions.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('agent_connection_grants', (table) => {
        table
            .uuid('agent_connection_grant_uuid')
            .primary()
            .defaultTo(knex.raw('gen_random_uuid()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index('agent_connection_grants_org_idx');
        table
            .uuid('subject_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index('agent_connection_grants_subject_idx');
        table
            .text('client_id')
            .notNullable()
            .references('client_id')
            .inTable('oauth2_clients')
            .onDelete('CASCADE')
            .index('agent_connection_grants_client_idx');
        table.text('credential_kind').notNullable().checkIn(['oauth']);
        table.text('actor_kind').notNullable().checkIn(['agent']);
        table.text('name').notNullable();
        table.index(
            ['subject_user_uuid', 'organization_uuid'],
            'agent_connection_grants_subject_org_idx',
        );
        table.text('resource').notNullable();
        table.uuid('refresh_family_uuid').nullable().unique();
        table.specificType('approved_capabilities', 'text[]').notNullable();
        table.specificType('approved_project_uuids', 'uuid[]').notNullable();
        table
            .jsonb('resource_constraints')
            .notNullable()
            .defaultTo('{"version":1}');
        table.integer('grant_contract_version').notNullable();
        table.integer('grant_revision').notNullable().defaultTo(1);
        table.integer('approval_policy_version').nullable();
        table
            .uuid('approved_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index('agent_connection_grants_approved_by_idx');
        table
            .text('approval_method')
            .notNullable()
            .checkIn(['browser_consent']);
        table
            .timestamp('approved_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.uuid('approval_request_uuid').nullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('revoked_at', { useTz: true }).nullable();
        table
            .uuid('revoked_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index('agent_connection_grants_revoked_by_idx');
        table.text('revocation_reason').nullable();
        table
            .uuid('replaced_by_grant_uuid')
            .nullable()
            .references('agent_connection_grant_uuid')
            .inTable('agent_connection_grants')
            .onDelete('SET NULL')
            .index('agent_connection_grants_replaced_by_idx');
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('last_used_at', { useTz: true }).nullable();
        table.check('expires_at > approved_at');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('agent_connection_grants');
}
