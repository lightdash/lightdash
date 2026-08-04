import { Knex } from 'knex';

const ANNOUNCEMENTS_TABLE = 'project_announcements';
const DUE_INDEX = 'project_announcements_due_scheduled_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
        table.timestamp('scheduled_publish_at', { useTz: false }).nullable();
    });
    // The sweep scans for due unpublished rows; keep that scan indexed.
    await knex.raw(
        `CREATE INDEX ?? ON ?? (scheduled_publish_at) WHERE published_at IS NULL AND scheduled_publish_at IS NOT NULL`,
        [DUE_INDEX, ANNOUNCEMENTS_TABLE],
    );
}

export async function down(knex: Knex): Promise<void> {
    // The column stays on rollback — dropping columns is a dangerous
    // operation, and old code simply ignores it.
    await knex.raw(`DROP INDEX IF EXISTS ??`, [DUE_INDEX]);
}
