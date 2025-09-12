import { Knex } from 'knex';

const TAGS_TABLE = 'tags';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TAGS_TABLE, (table) => {
        table.dropUnique(['project_uuid', 'name']);
        table.index('name');
    });
}

export async function down(knex: Knex): Promise<void> {
    // This migration fixes a bug in a projectuuid + name unique constraint that was created in 20241104105903_add-project-tags-table.ts.
    // It was too restrictive and prevented tags from being created with the same name in the same project.
    await knex.schema.alterTable(TAGS_TABLE, (table) => {
        table.dropIndex('name');
    });
}
