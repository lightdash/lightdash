import { Knex } from 'knex';

const ProjectTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (table) => {
            table
                .boolean('scheduler_failure_notify_recipients')
                .defaultTo(false)
                .notNullable();
            table
                .boolean('scheduler_failure_include_contact')
                .defaultTo(false)
                .notNullable();
            table.text('scheduler_failure_contact_override').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn('scheduler_failure_contact_override');
        table.dropColumn('scheduler_failure_include_contact');
        table.dropColumn('scheduler_failure_notify_recipients');
    });
}
