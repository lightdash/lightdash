import { type Knex } from 'knex';

const SLACK_UNFURL_IMAGES_TABLE = 'slack_unfurl_images';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable(SLACK_UNFURL_IMAGES_TABLE, (table) => {
        table.text('nanoid').primary();
        table.text('s3_key').notNullable();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists(SLACK_UNFURL_IMAGES_TABLE);
};
