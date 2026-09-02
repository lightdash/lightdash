import { Knex } from 'knex';

const AppsTable = 'apps';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTable, (table) => {
        // Slug of the organization data app template the app was built
        // from (null when built from scratch or a built-in flavour). Kept
        // as a slug rather than a foreign key: deleting a template must not
        // touch the apps already built from it.
        table.text('template_slug').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTable, (table) => {
        table.dropColumn('template_slug');
    });
}
