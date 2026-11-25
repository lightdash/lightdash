import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Deletes custom role scope rows that this release no longer reads; agent capabilities come from the organization and project agent policy. A previous release still running mid-rollout can only see fewer agent capabilities on custom roles, never more',
} as const;

const AGENT_CAPABILITY_SCOPE_NAMES = [
    'view:AgentReadDiscover',
    'view:AgentQuery',
    'view:AgentRawSql',
    'view:AgentContentWrite',
    'view:AgentDelete',
    'view:AgentPublish',
    'view:AgentDeployUpload',
    'view:AgentDbtWriteback',
    'view:AgentExport',
    'view:AgentAdministration',
    'view:AgentExternalTools',
];

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex('scoped_roles')
        .whereIn('scope_name', AGENT_CAPABILITY_SCOPE_NAMES)
        .delete();
}

export async function down(): Promise<void> {
    throw new Error('irreversible: the scopes are no longer defined');
}
