import { type Knex } from 'knex';

const ManagedAgentRunsTableName = 'managed_agent_runs';
const ManagedAgentActionsTableName = 'managed_agent_actions';

// Synthesised rows are tagged with this exact string in `error` so the
// down() migration can distinguish them from any future user runs that
// also happen to be cron-triggered + completed + summary-less.
const BACKFILL_MARKER = '__backfilled__';

export const up = async (knex: Knex): Promise<void> => {
    await knex.raw(
        `WITH new_runs AS (
            INSERT INTO ${ManagedAgentRunsTableName}
                (project_uuid, triggered_by, status, session_id, started_at, finished_at, action_count, summary, error)
            SELECT
                project_uuid,
                'cron',
                'completed',
                session_id,
                MIN(created_at),
                MAX(created_at),
                COUNT(*),
                NULL,
                ?
            FROM ${ManagedAgentActionsTableName}
            WHERE managed_agent_run_uuid IS NULL
            GROUP BY project_uuid, session_id
            RETURNING managed_agent_run_uuid, project_uuid, session_id
        )
        UPDATE ${ManagedAgentActionsTableName} a
        SET managed_agent_run_uuid = nr.managed_agent_run_uuid
        FROM new_runs nr
        WHERE a.project_uuid = nr.project_uuid
          AND a.session_id = nr.session_id
          AND a.managed_agent_run_uuid IS NULL`,
        [BACKFILL_MARKER],
    );
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.raw(
        `UPDATE ${ManagedAgentActionsTableName}
         SET managed_agent_run_uuid = NULL
         WHERE managed_agent_run_uuid IN (
             SELECT managed_agent_run_uuid FROM ${ManagedAgentRunsTableName}
             WHERE error = ?
         )`,
        [BACKFILL_MARKER],
    );
    await knex.raw(`DELETE FROM ${ManagedAgentRunsTableName} WHERE error = ?`, [
        BACKFILL_MARKER,
    ]);
};
