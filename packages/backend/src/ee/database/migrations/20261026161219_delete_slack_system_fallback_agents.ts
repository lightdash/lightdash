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

const systemAgentUuids = (
    knex: Knex,
    linked: 'with-links' | 'without-links',
): Promise<string[]> => {
    const query = knex(AI_AGENT_TABLE).where('is_system', true);
    if (linked === 'with-links') {
        void query.where(hasLinkedRows(knex));
    } else {
        void query.whereNot(hasLinkedRows(knex));
    }
    return query.pluck('ai_agent_uuid');
};

export async function up(knex: Knex): Promise<void> {
    const kept = await systemAgentUuids(knex, 'with-links');
    if (kept.length > 0) {
        console.warn(
            `${LOG_PREFIX} Keeping ${kept.length} agent row(s) flagged is_system that have integrations or access rules attached; listings keep hiding them until the column is dropped.`,
        );
    }

    const condemned = await systemAgentUuids(knex, 'without-links');
    console.log(
        `${LOG_PREFIX} Deleting ${condemned.length} built-in Slack fallback agent row(s).`,
    );
    if (condemned.length === 0) {
        return;
    }

    await knex(AI_AGENT_TABLE).whereIn('ai_agent_uuid', condemned).delete();
}

export async function down(): Promise<void> {
    throw new Error('irreversible: fallback agent rows cannot be restored');
}
