import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Clears the sample-data tag on projects whose warehouse is no longer the embedded DuckDB. Older releases treat an untagged project as an ordinary one.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        UPDATE projects
        SET provisioning_source = NULL,
            playground_bundle_version = NULL
        WHERE provisioning_source = 'playground'
          AND EXISTS (
              SELECT 1
              FROM warehouse_credentials
              WHERE warehouse_credentials.project_id = projects.project_id
                AND warehouse_credentials.warehouse_type <> 'duckdb'
          )
    `);
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: which projects carried the sample-data tag is lost',
    );
}
