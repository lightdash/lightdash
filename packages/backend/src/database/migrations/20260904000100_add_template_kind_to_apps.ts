import { Knex } from 'knex';

const AppsTable = 'apps';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTable, (table) => {
        // Kind of the organization template the app was built from
        // ('seeded' | 'instructions'), pinned at creation. The pipeline
        // reads it instead of re-deriving the kind from the template's
        // current files, so republishing or deleting a template never
        // changes what the apps already built from it may do.
        table.text('template_kind').nullable();
    });
    // Backfill from the template's current files, the same rule the
    // service uses (any src/ file besides the manifest means seeded). An
    // app whose template is already gone was built when only seeded
    // templates existed, so it pins as seeded.
    await knex.raw(`
        UPDATE ${AppsTable} a
        SET template_kind = CASE
            WHEN EXISTS (
                SELECT 1
                FROM data_app_template_files f
                WHERE f.template_uuid = t.template_uuid
                  AND f.filename LIKE 'src/%'
                  AND f.filename <> 'src/template.json'
            ) THEN 'seeded'
            ELSE 'instructions'
        END
        FROM projects p
        JOIN organizations o ON o.organization_id = p.organization_id
        JOIN data_app_templates t
          ON t.organization_uuid = o.organization_uuid
        WHERE p.project_uuid = a.project_uuid
          AND a.template_slug = t.slug
    `);
    await knex.raw(`
        UPDATE ${AppsTable}
        SET template_kind = 'seeded'
        WHERE template_slug IS NOT NULL AND template_kind IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTable, (table) => {
        table.dropColumn('template_kind');
    });
}
