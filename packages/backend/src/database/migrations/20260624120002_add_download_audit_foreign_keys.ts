import { Knex } from 'knex';

const TABLE = 'download_audit';

/**
 * download_audit has two org/project columns that never had foreign keys. Clean up
 * orphans to match each intended ON DELETE behaviour, then add validated FKs:
 *
 * - organization_uuid (NOT NULL) -> CASCADE: an orphan whose org was hard-deleted
 *   should have been cascade-deleted, so delete the row.
 * - project_uuid (nullable) -> SET NULL: an orphan should have been nulled when its
 *   project was deleted, so null it (non-destructive — the audit row still belongs
 *   to a live org).
 *
 * project_uuid is the only FK column here without an index, so add one.
 */
export async function up(knex: Knex): Promise<void> {
    await knex(TABLE)
        .whereNotExists(
            knex('organizations')
                .select('organization_id')
                .whereRaw(
                    'organizations.organization_uuid = download_audit.organization_uuid',
                ),
        )
        .delete();

    await knex(TABLE)
        .whereNotNull('project_uuid')
        .whereNotExists(
            knex('projects')
                .select('project_id')
                .whereRaw(
                    'projects.project_uuid = download_audit.project_uuid',
                ),
        )
        .update({ project_uuid: null });

    await knex.schema.alterTable(TABLE, (table) => {
        table.index(['project_uuid'], 'download_audit_project_uuid_idx');
        table
            .foreign('organization_uuid')
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE, (table) => {
        table.dropForeign('organization_uuid');
        table.dropForeign('project_uuid');
        table.dropIndex(['project_uuid'], 'download_audit_project_uuid_idx');
    });
}
