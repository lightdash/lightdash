import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Preserves workspace identifiers, thread uniqueness and existing drafts while allowing independent changes.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`
        ALTER TABLE semantic_studio_workspaces
            ALTER COLUMN ai_thread_uuid DROP NOT NULL,
            DROP CONSTRAINT semantic_studio_workspaces_ai_thread_uuid_foreign,
            ADD FOREIGN KEY (ai_thread_uuid) REFERENCES ai_thread(ai_thread_uuid) ON DELETE SET NULL
    `);
    await knex.raw(`
        WITH latest AS (
            SELECT DISTINCT ON (ai_thread_uuid) ai_thread_uuid, pr_url
            FROM ai_writeback_run WHERE pr_url IS NOT NULL
            ORDER BY ai_thread_uuid, created_at DESC
        )
        UPDATE semantic_studio_workspaces w
        SET pull_request_url = latest.pr_url, pull_request_state = NULL
        FROM latest WHERE latest.ai_thread_uuid = w.ai_thread_uuid
          AND w.pull_request_url IS DISTINCT FROM latest.pr_url
    `);
    await knex.raw(`
        WITH recovered AS (
            INSERT INTO semantic_studio_workspaces
                (organization_uuid, project_uuid, created_by_user_uuid, name, is_active)
            SELECT DISTINCT o.organization_uuid, d.project_uuid, d.created_by_user_uuid, 'Recovered changes', false
            FROM project_model_draft_changes d JOIN projects p USING (project_uuid)
            JOIN organizations o USING (organization_id)
            WHERE d.workspace_uuid IS NULL AND d.status = 'draft'
            RETURNING semantic_studio_workspace_uuid, project_uuid, created_by_user_uuid
        )
        UPDATE project_model_draft_changes d SET workspace_uuid = w.semantic_studio_workspace_uuid
        FROM recovered w
        WHERE d.project_uuid = w.project_uuid AND d.created_by_user_uuid = w.created_by_user_uuid
          AND d.workspace_uuid IS NULL AND d.status = 'draft'
    `);
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: a change can have drafts without a conversation',
    );
}
