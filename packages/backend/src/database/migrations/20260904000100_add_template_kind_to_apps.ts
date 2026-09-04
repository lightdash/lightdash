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
    // Apps built before the column existed came from seeded templates (the
    // only kind that existed until instructions-only ones shipped).
    await knex.raw(
        `UPDATE ${AppsTable} SET template_kind = 'seeded' WHERE template_slug IS NOT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTable, (table) => {
        table.dropColumn('template_kind');
    });
}
