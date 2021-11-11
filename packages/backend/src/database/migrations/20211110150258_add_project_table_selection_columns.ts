import { Knex } from 'knex';

const ProjectTableName = 'projects';
const TableSelectionTypeTableName = 'table_selection_type';
const TableSelectionTypeColumnName = 'table_selection_type';
const TableSelectionValueColumnName = 'table_selection_value';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        TableSelectionTypeTableName,
        (tableBuilder) => {
            tableBuilder.string(TableSelectionTypeColumnName).primary();
        },
    );
    await knex(TableSelectionTypeTableName).insert([
        { [TableSelectionTypeColumnName]: 'ALL' },
        { [TableSelectionTypeColumnName]: 'WITH_TAGS' },
        { [TableSelectionTypeColumnName]: 'WITH_NAMES' },
    ]);

    await knex.schema.table(ProjectTableName, (table) => {
        table
            .string(TableSelectionTypeColumnName)
            .notNullable()
            .defaultTo('ALL')
            .references(TableSelectionTypeColumnName)
            .inTable(TableSelectionTypeTableName)
            .onDelete('CASCADE');
        table.specificType(TableSelectionValueColumnName, 'text[]');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            ProjectTableName,
            TableSelectionTypeColumnName,
        )
    ) {
        await knex.schema.table(ProjectTableName, (table) => {
            table.dropColumns(
                TableSelectionTypeColumnName,
                TableSelectionValueColumnName,
            );
        });
    }
    await knex.schema.dropTableIfExists(TableSelectionTypeTableName);
}
