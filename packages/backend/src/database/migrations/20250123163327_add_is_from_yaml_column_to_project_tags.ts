import { Knex } from 'knex';

const TAGS_TABLE = 'tags';
const CATALOG_SEARCH_TAGS_TABLE = 'catalog_search_tags';

export async function up(knex: Knex): Promise<void> {
    // Add yaml_reference column to tags table, this means that the tag is created from a YAML file
    await knex.schema.alterTable(TAGS_TABLE, (table) => {
        table.string('yaml_reference').nullable();
        table.unique(['project_uuid', 'yaml_reference'], {
            predicate: knex.whereNotNull('yaml_reference'),
        });
    });

    // Add is_from_yaml column to catalog_search_tags table, this means that the relationship between a tag and a catalog item is created from a YAML file
    await knex.schema.alterTable(CATALOG_SEARCH_TAGS_TABLE, (table) => {
        table.boolean('is_from_yaml').notNullable().defaultTo(false).index();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(TAGS_TABLE, 'yaml_reference')) {
        await knex.schema.alterTable(TAGS_TABLE, (table) => {
            table.dropColumn('yaml_reference');
        });
    }

    if (
        await knex.schema.hasColumn(CATALOG_SEARCH_TAGS_TABLE, 'is_from_yaml')
    ) {
        await knex.schema.alterTable(CATALOG_SEARCH_TAGS_TABLE, (table) => {
            table.dropColumn('is_from_yaml');
        });
    }
}
