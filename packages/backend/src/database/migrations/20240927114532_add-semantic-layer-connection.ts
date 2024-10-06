import { Knex } from 'knex';

const ProjectTableName = 'projects';
const SemanticLayerConnectionColumn = 'semantic_layer_connection';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.binary(SemanticLayerConnectionColumn).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn(SemanticLayerConnectionColumn);
    });
}
