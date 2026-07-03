import { Knex } from 'knex';

const RoadmapItemsTableName = 'roadmap_items';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RoadmapItemsTableName, (table) => {
        table.text('issue_url').nullable();
        table.text('pull_request_url').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RoadmapItemsTableName, (table) => {
        table.dropColumn('issue_url');
        table.dropColumn('pull_request_url');
    });
}
