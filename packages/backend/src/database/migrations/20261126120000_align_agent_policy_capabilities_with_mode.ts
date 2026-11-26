import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Rewrites the saved capability list so it alone describes each policy. A managed policy with no list is treated as every capability by old and new versions, and a legacy policy ignores its list in old versions, so neither version changes behaviour',
} as const;

const TABLE = 'organization_agent_capability_policies';

const ALL_CAPABILITIES = [
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
];

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex(TABLE)
        .where('mode', 'managed')
        .whereNull('allowed_capabilities')
        .update({ allowed_capabilities: ALL_CAPABILITIES } as never);
    await knex(TABLE)
        .where('mode', 'legacy')
        .whereNotNull('allowed_capabilities')
        .update({ allowed_capabilities: null });
}

export async function down(): Promise<void> {
    throw new Error('irreversible: previous capability lists are not kept');
}
