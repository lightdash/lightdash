import { Knex } from 'knex';

const chartsTable = 'saved_queries';
const dashboards = 'dashboards';
const spaces = 'spaces';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(chartsTable, (table) => {
        table.string('slug').nullable().index();
    });

    await knex.schema.alterTable(dashboards, (table) => {
        table.string('slug').nullable().index();
    });
    await knex.schema.alterTable(spaces, (table) => {
        table.string('slug').nullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(chartsTable, 'slug')) {
        await knex.schema.alterTable(chartsTable, (table) => {
            table.dropColumn('slug');
        });
    }
    if (await knex.schema.hasColumn(dashboards, 'slug')) {
        await knex.schema.alterTable(dashboards, (table) => {
            table.dropColumn('slug');
        });
    }
    if (await knex.schema.hasColumn(spaces, 'slug')) {
        await knex.schema.alterTable(spaces, (table) => {
            table.dropColumn('slug');
        });
    }
}
