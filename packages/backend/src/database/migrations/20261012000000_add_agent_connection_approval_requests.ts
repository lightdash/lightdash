import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty review request table with indexed foreign keys and no changes to existing credentials or authorization tables.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(
        'agent_connection_approval_requests',
        (table) => {
            table
                .uuid('agent_connection_approval_request_uuid')
                .primary()
                .defaultTo(knex.raw('gen_random_uuid()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index('agent_approval_org_idx');
            table
                .uuid('subject_user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE')
                .index('agent_approval_subject_idx');
            table
                .text('client_id')
                .notNullable()
                .references('client_id')
                .inTable('oauth2_clients')
                .onDelete('CASCADE')
                .index('agent_approval_client_idx');
            table.text('name').notNullable();
            table.text('redirect_uri').notNullable();
            table.text('state').notNullable();
            table.text('code_challenge').notNullable();
            table.text('resource').notNullable();
            table.jsonb('requested_projects').nullable();
            table.jsonb('requested_capabilities').notNullable();
            table.integer('expires_in_seconds').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('request_expires_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.raw("now() + interval '15 minutes'"))
                .index('agent_approval_expiry_idx');
            table.binary('review_session_hash').nullable();
            table.binary('csrf_hash').nullable();
            table.jsonb('displayed_selection').nullable();
            table.integer('displayed_policy_version').nullable();
            table.integer('review_revision').notNullable().defaultTo(0);
            table.jsonb('approved_selection').nullable();
            table.timestamp('approved_at', { useTz: true }).nullable();
            table.integer('approval_policy_version').nullable();
            table.timestamp('decision_consumed_at', { useTz: true }).nullable();
            table.timestamp('callback_consumed_at', { useTz: true }).nullable();
            table.text('terminal_error').nullable();
            table.index(
                [
                    'subject_user_uuid',
                    'organization_uuid',
                    'request_expires_at',
                ],
                'agent_approval_pending_idx',
            );
            table.check("client_id = 'lightdash-cli'");
            table.check("name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'");
            table.check(
                "length(state) BETWEEN 22 AND 512 AND state ~ '^[A-Za-z0-9_-]+$'",
            );
            table.check("code_challenge ~ '^[A-Za-z0-9_-]{43}$'");
            table.check('expires_in_seconds BETWEEN 1 AND 604800');
            table.check('request_expires_at > created_at');
            table.check(
                "requested_projects IS NULL OR (jsonb_typeof(requested_projects) = 'array' AND jsonb_array_length(requested_projects) BETWEEN 1 AND 500)",
            );
            table.check(
                "jsonb_typeof(requested_capabilities) = 'array' AND jsonb_array_length(requested_capabilities) <= 11",
            );
            table.check(`(review_revision = 0 AND review_session_hash IS NULL AND csrf_hash IS NULL AND displayed_selection IS NULL AND displayed_policy_version IS NULL)
            OR (review_revision > 0 AND review_session_hash IS NOT NULL AND octet_length(review_session_hash) = 32 AND csrf_hash IS NOT NULL AND octet_length(csrf_hash) = 32 AND displayed_selection IS NOT NULL AND displayed_policy_version IS NOT NULL AND displayed_policy_version >= 0)`);
            table.check(`(decision_consumed_at IS NULL AND terminal_error IS NULL AND approved_selection IS NULL AND approved_at IS NULL AND approval_policy_version IS NULL AND callback_consumed_at IS NULL)
            OR (decision_consumed_at IS NOT NULL AND review_revision > 0 AND terminal_error IS NOT NULL AND (
                (terminal_error = 'access_denied' AND approved_selection IS NULL AND approved_at IS NULL AND approval_policy_version IS NULL)
                OR (terminal_error = 'agent_connections_unavailable' AND approved_selection IS NOT NULL AND approved_at IS NOT NULL AND approved_at = decision_consumed_at AND approval_policy_version IS NOT NULL AND approval_policy_version >= 0)))`);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('agent_connection_approval_requests');
}
