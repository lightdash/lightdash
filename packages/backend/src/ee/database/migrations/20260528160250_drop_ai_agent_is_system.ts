import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const ONE_SYSTEM_PER_PROJECT_INDEX = 'ai_agent_one_system_agent_per_project';

/**
 * Identifying a row as "system agent" for deletion is a one-shot, destructive
 * decision: ON DELETE CASCADE then takes the row's threads, prompts, eval
 * runs, instruction versions, integrations and access rules with it. The
 * column was only ever written by `AiAgentModel.getOrCreateSystemAgent`, which
 * always creates the row with empty integrations and empty group/user/space
 * access — so a system-agent row that has any of those FK rows is anomalous
 * (manual DB edit, future code drift, or a real agent flipped to is_system by
 * mistake) and must not be silently destroyed.
 *
 * This query returns any `is_system = true` row that violates that invariant;
 * if it returns anything, we abort the migration so an operator can decide.
 */
async function findAnomalousSystemAgents(knex: Knex): Promise<
    Array<{
        ai_agent_uuid: string;
        name: string;
        organization_uuid: string;
        project_uuid: string;
        integrations_count: number;
        group_access_count: number;
        user_access_count: number;
        space_access_count: number;
    }>
> {
    return knex(`${AI_AGENT_TABLE} as a`)
        .where('a.is_system', true)
        .select<
            Array<{
                ai_agent_uuid: string;
                name: string;
                organization_uuid: string;
                project_uuid: string;
                integrations_count: number;
                group_access_count: number;
                user_access_count: number;
                space_access_count: number;
            }>
        >(
            'a.ai_agent_uuid',
            'a.name',
            'a.organization_uuid',
            'a.project_uuid',
            knex.raw(`(
                SELECT COUNT(*)::int
                FROM ai_agent_integration ai
                WHERE ai.ai_agent_uuid = a.ai_agent_uuid
            ) as integrations_count`),
            knex.raw(`(
                SELECT COUNT(*)::int
                FROM ai_agent_group_access ga
                WHERE ga.ai_agent_uuid = a.ai_agent_uuid
            ) as group_access_count`),
            knex.raw(`(
                SELECT COUNT(*)::int
                FROM ai_agent_user_access ua
                WHERE ua.ai_agent_uuid = a.ai_agent_uuid
            ) as user_access_count`),
            knex.raw(`(
                SELECT COUNT(*)::int
                FROM ai_agent_space_access sa
                WHERE sa.ai_agent_uuid = a.ai_agent_uuid
            ) as space_access_count`),
        )
        .havingRaw(
            `(
                SELECT COUNT(*) FROM ai_agent_integration ai
                WHERE ai.ai_agent_uuid = a.ai_agent_uuid
             ) > 0
             OR (
                SELECT COUNT(*) FROM ai_agent_group_access ga
                WHERE ga.ai_agent_uuid = a.ai_agent_uuid
             ) > 0
             OR (
                SELECT COUNT(*) FROM ai_agent_user_access ua
                WHERE ua.ai_agent_uuid = a.ai_agent_uuid
             ) > 0
             OR (
                SELECT COUNT(*) FROM ai_agent_space_access sa
                WHERE sa.ai_agent_uuid = a.ai_agent_uuid
             ) > 0`,
        )
        .groupBy(
            'a.ai_agent_uuid',
            'a.name',
            'a.organization_uuid',
            'a.project_uuid',
        );
}

export async function up(knex: Knex): Promise<void> {
    // Safety check: refuse to destroy anything that doesn't look like a
    // system agent. See findAnomalousSystemAgents for the invariant.
    const anomalies = await findAnomalousSystemAgents(knex);
    if (anomalies.length > 0) {
        throw new Error(
            `Refusing to drop ai_agent.is_system: ${anomalies.length} ` +
                `row(s) with is_system = true have integrations or access ` +
                `rules attached, which a real system agent never does. ` +
                `Investigate and resolve manually before re-running this ` +
                `migration. Affected rows: ${JSON.stringify(anomalies)}`,
        );
    }

    // Surface what we're about to drop in the migrator output, so the
    // deployment log retains a record beyond the row count knex prints.
    const condemned = await knex(AI_AGENT_TABLE)
        .where('is_system', true)
        .select<
            Array<{
                ai_agent_uuid: string;
                name: string;
                organization_uuid: string;
                project_uuid: string;
            }>
        >('ai_agent_uuid', 'name', 'organization_uuid', 'project_uuid');
    // eslint-disable-next-line no-console
    console.log(
        `[20260528160250_drop_ai_agent_is_system] Deleting ${condemned.length} system agent row(s):`,
        condemned,
    );

    // FKs on ai_thread / ai_agent_integration / ai_agent_instruction_versions
    // / etc. all CASCADE, so the agent's threads go with it. The condemned
    // rows have empty integrations/access by the assertion above, but they
    // can legitimately own threads/prompts/instruction versions — those are
    // by-product state of the flag-gated, never-GA assistant and are
    // intentionally discarded.
    await knex(AI_AGENT_TABLE).where('is_system', true).delete();

    await knex.raw(`DROP INDEX IF EXISTS ${ONE_SYSTEM_PER_PROJECT_INDEX}`);
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.dropColumn('is_system');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.boolean('is_system').notNullable().defaultTo(false);
    });

    await knex.raw(`
        CREATE UNIQUE INDEX ${ONE_SYSTEM_PER_PROJECT_INDEX}
        ON ${AI_AGENT_TABLE} (organization_uuid, project_uuid)
        WHERE is_system
    `);
}
