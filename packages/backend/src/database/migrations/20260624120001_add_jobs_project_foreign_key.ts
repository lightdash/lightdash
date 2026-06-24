import { Knex } from 'knex';

const TABLE = 'jobs';

/**
 * jobs.project_uuid (nullable) never had a foreign key. The FK is ON DELETE CASCADE,
 * so an orphan — a non-null project_uuid pointing at a hard-deleted project — is a
 * row that should have been cascade-deleted with its project. Delete those (this
 * cascades to job_steps via the existing job_steps.job_uuid CASCADE FK). Rows with a
 * NULL project_uuid are valid and left untouched. Then add a validated CASCADE FK.
 * jobs.project_uuid already has an index (jobs_project_uuid_index).
 */
export async function up(knex: Knex): Promise<void> {
    await knex(TABLE)
        .whereNotNull('project_uuid')
        .whereNotExists(
            knex('projects')
                .select('project_id')
                .whereRaw('projects.project_uuid = jobs.project_uuid'),
        )
        .delete();

    await knex.schema.alterTable(TABLE, (table) => {
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE, (table) => {
        table.dropForeign('project_uuid');
    });
}
