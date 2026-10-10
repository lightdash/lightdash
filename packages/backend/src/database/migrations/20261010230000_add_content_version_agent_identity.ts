import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable version columns and a new action history table with indexes on the empty table.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('saved_queries_versions', (table) => {
        table.jsonb('agent_identity').nullable();
    });
    await knex.schema.alterTable('dashboard_versions', (table) => {
        table.jsonb('agent_identity').nullable();
    });
    await knex.schema.alterTable('saved_sql_versions', (table) => {
        table.jsonb('agent_identity').nullable();
    });
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('agent_identity').nullable();
    });
    await knex.schema.alterTable('document_versions', (table) => {
        table.jsonb('agent_identity').nullable();
    });
    await knex.schema.createTable('agent_action_log', (table) => {
        table
            .uuid('agent_action_log_uuid')
            .primary()
            .defaultTo(knex.raw('gen_random_uuid()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.uuid('project_uuid').nullable();
        table
            .timestamp('occurred_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.jsonb('agent_identity').notNullable();
        table.text('object_type').notNullable();
        table.uuid('object_uuid').nullable();
        table.text('object_id').nullable();
        table.uuid('version_uuid').nullable();
        table.text('action').notNullable();
        table.text('outcome').notNullable();
        table.text('policy_layer').nullable();
        table.text('reason_code').nullable();
        table.check(
            "outcome IN ('allowed', 'denied')",
            [],
            'agent_action_log_outcome_check',
        );
        table.index('occurred_at', 'agent_action_log_retention_idx');
    });
    await knex.raw(
        'CREATE INDEX agent_action_log_org_time_idx ON agent_action_log (organization_uuid, occurred_at DESC)',
    );
    await knex.raw(
        "CREATE INDEX agent_action_log_org_client_idx ON agent_action_log (organization_uuid, (agent_identity->'act'->>'client_id'), occurred_at)",
    );
    await knex.raw(
        "CREATE INDEX agent_action_log_org_agent_idx ON agent_action_log (organization_uuid, (agent_identity->'act'->>'agent_uuid'), occurred_at)",
    );
    await knex.raw(
        "CREATE INDEX agent_action_log_org_subject_idx ON agent_action_log (organization_uuid, (agent_identity->'subject'->>'uuid'), occurred_at)",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('agent_action_log');
    await knex.schema.alterTable('document_versions', (table) => {
        table.dropColumn('agent_identity');
    });
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('agent_identity');
    });
    await knex.schema.alterTable('saved_sql_versions', (table) => {
        table.dropColumn('agent_identity');
    });
    await knex.schema.alterTable('dashboard_versions', (table) => {
        table.dropColumn('agent_identity');
    });
    await knex.schema.alterTable('saved_queries_versions', (table) => {
        table.dropColumn('agent_identity');
    });
}
