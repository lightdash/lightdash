import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Deletes the hidden built-in Slack fallback agent rows (is_system = true) that the removed fallback created on first use. No schema change: the is_system column and its partial index stay until a later release drops them once no running code reads them.',
} as const;

const AI_AGENT_TABLE = 'ai_agent';
const AGENT_LINK_TABLES = [
    'ai_agent_integration',
    'ai_agent_group_access',
    'ai_agent_user_access',
    'ai_agent_space_access',
] as const;
const LOG_PREFIX = '[20261026161219_delete_slack_system_fallback_agents]';

type SystemAgentRow = {
    ai_agent_uuid: string;
    name: string;
    organization_uuid: string;
    project_uuid: string;
};

const hasLinkedRows =
    (knex: Knex) =>
    (builder: Knex.QueryBuilder): void => {
        AGENT_LINK_TABLES.forEach((table) => {
            void builder.orWhereExists(
                knex(table).where(
                    `${table}.ai_agent_uuid`,
                    knex.ref(`${AI_AGENT_TABLE}.ai_agent_uuid`),
                ),
            );
        });
    };

const selectSystemAgents = (knex: Knex) =>
    knex(AI_AGENT_TABLE)
        .where('is_system', true)
        .select<SystemAgentRow[]>(
            'ai_agent_uuid',
            'name',
            'organization_uuid',
            'project_uuid',
        );

export async function up(knex: Knex): Promise<void> {
    const kept = await selectSystemAgents(knex).where(hasLinkedRows(knex));
    if (kept.length > 0) {
        console.warn(
            `${LOG_PREFIX} Keeping ${kept.length} agent row(s) flagged is_system that have integrations or access rules attached; they now list as normal agents:`,
            kept,
        );
    }

    const condemned = await selectSystemAgents(knex).whereNot(
        hasLinkedRows(knex),
    );
    console.log(
        `${LOG_PREFIX} Deleting ${condemned.length} built-in Slack fallback agent row(s):`,
        condemned,
    );
    if (condemned.length === 0) {
        return;
    }

    await knex(AI_AGENT_TABLE)
        .whereIn(
            'ai_agent_uuid',
            condemned.map((row) => row.ai_agent_uuid),
        )
        .delete();
}

export async function down(): Promise<void> {
    throw new Error('irreversible: fallback agent rows cannot be restored');
}
