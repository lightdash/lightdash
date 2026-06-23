import { Knex } from 'knex';

const RoadmapCustomerLinksTableName = 'roadmap_customer_links';
const RoadmapItemsTableName = 'roadmap_items';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(RoadmapCustomerLinksTableName, (table) => {
        table
            .uuid('roadmap_customer_link_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        // Identifier of the Lightdash organization this Linear customer maps
        // to. This is an external instance's org, so there is intentionally no
        // foreign key to the local organizations table.
        table.uuid('organization_uuid').notNullable().unique();
        table.text('linear_customer_id').notNullable();
        table.text('linear_customer_name').notNullable();
        table
            .timestamp('synced_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(RoadmapItemsTableName, (table) => {
        table
            .uuid('roadmap_item_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('roadmap_customer_link_uuid')
            .notNullable()
            .references('roadmap_customer_link_uuid')
            .inTable(RoadmapCustomerLinksTableName)
            .onDelete('CASCADE')
            .index();
        table.text('linear_issue_id').notNullable();
        table.text('title').notNullable();
        table.text('description').nullable();
        table.text('status').notNullable();
        table.integer('position').notNullable().defaultTo(0);
        table
            .timestamp('synced_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['roadmap_customer_link_uuid', 'linear_issue_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(RoadmapItemsTableName);
    await knex.schema.dropTableIfExists(RoadmapCustomerLinksTableName);
}
