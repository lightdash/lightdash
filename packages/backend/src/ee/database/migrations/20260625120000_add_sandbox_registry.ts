import { Knex } from 'knex';

const SandboxRegistryTableName = 'sandbox_registry';
const AiWritebackThreadTableName = 'ai_writeback_thread';
const AiThreadTableName = 'ai_thread';
// The in-sandbox repo path at the time of this migration (AiWritebackService
// CWD). Inlined rather than imported so the migration stays pinned even if the
// constant later moves. E2B ignores the workspace on pause/resume anyway.
const WritebackCwd = '/home/user/repo';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SandboxRegistryTableName))) {
        await knex.schema.createTable(SandboxRegistryTableName, (table) => {
            table
                .uuid('sandbox_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            // Which backend owns the sandbox: 'e2b' | 'docker'.
            table.text('provider').notNullable();
            // The provider's own id for the currently-live sandbox. Null while
            // suspended on a non-native-pause backend (the container is gone and
            // the state lives only in the snapshot).
            table.text('provider_sandbox_id').nullable();
            // 'running' | 'suspended'.
            table.text('status').notNullable().defaultTo('running');
            // SnapshotRef of the persisted state (e2b-paused | s3-tar). Null
            // while running.
            table.jsonb('snapshot_ref').nullable();
            // PersistentWorkspace declared at acquire time, so the reaper can
            // snapshot an orphaned sandbox without knowing which feature owns it.
            table.jsonb('workspace').notNullable();
            table
                .timestamp('last_activity_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            // The reaper scans by (status, last_activity_at) to find idle/expired
            // sandboxes.
            table.index(['status', 'last_activity_at']);
        });
    }

    // The thread row stored the provider's own sandbox id in `sandbox_id`
    // (stable on E2B). With persist+destroy on non-native-pause providers the
    // provider id changes every turn, so the thread now references the
    // registry-owned, stable `sandbox_uuid` instead.
    //
    // Expand-only and backwards-compatible: we ADD `sandbox_uuid` rather than
    // renaming `sandbox_id`, so currently-deployed code that still reads/writes
    // `sandbox_id` keeps resuming throughout the rollout. `sandbox_id` is
    // dropped in a follow-up migration.
    await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
        table.uuid('sandbox_uuid').nullable();
        table.text('sandbox_id').nullable().alter();
    });

    // Backfill a registry row for every existing thread so live writeback
    // conversations keep resuming. Every existing `sandbox_id` is a live E2B
    // sandbox (E2B is the only production provider, and the feature is younger
    // than E2B's 90-day pause retention, so none have expired). We shape each
    // row exactly like a normal E2B suspend — `provider_sandbox_id` and an
    // `e2b-paused` `snapshot_ref` both point at the existing id, which resume
    // reconnects to via `Sandbox.connect(id)`. A thread whose sandbox was
    // killed out-of-band simply fails to resume into the existing "expired"
    // path; the row is GC'd by the reaper after the retention window.
    await knex.raw(
        `
        WITH mapping AS (
            SELECT
                awt.ai_writeback_thread_uuid AS thread_uuid,
                awt.sandbox_id,
                t.organization_uuid,
                t.project_uuid,
                uuid_generate_v4() AS new_sandbox_uuid
            FROM ?? awt
            JOIN ?? t ON t.ai_thread_uuid = awt.ai_thread_uuid
            WHERE awt.sandbox_id IS NOT NULL
        ),
        inserted AS (
            INSERT INTO ?? (
                sandbox_uuid, organization_uuid, project_uuid, provider,
                provider_sandbox_id, status, snapshot_ref, workspace,
                last_activity_at, created_at, updated_at
            )
            SELECT
                m.new_sandbox_uuid, m.organization_uuid, m.project_uuid, 'e2b',
                m.sandbox_id, 'suspended',
                jsonb_build_object('kind', 'e2b-paused', 'sandboxId', m.sandbox_id),
                jsonb_build_object('include', jsonb_build_array(?::text), 'exclude', jsonb_build_array()),
                now(), now(), now()
            FROM mapping m
        )
        UPDATE ?? awt
        SET sandbox_uuid = m.new_sandbox_uuid
        FROM mapping m
        WHERE awt.ai_writeback_thread_uuid = m.thread_uuid;
        `,
        [
            AiWritebackThreadTableName,
            AiThreadTableName,
            SandboxRegistryTableName,
            WritebackCwd,
            AiWritebackThreadTableName,
        ],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
        table.dropColumn('sandbox_uuid');
    });
    // Rows written by the new code have a null `sandbox_id`; drop them before
    // restoring the original NOT NULL constraint.
    await knex(AiWritebackThreadTableName).whereNull('sandbox_id').delete();
    await knex.schema.alterTable(AiWritebackThreadTableName, (table) => {
        table.text('sandbox_id').notNullable().alter();
    });
    await knex.schema.dropTableIfExists(SandboxRegistryTableName);
}
