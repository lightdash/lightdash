import { Knex } from 'knex';

const PreAggregateMaterializationTableName = 'pre_aggregate_materializations';
const TotalBytesColumnName = 'total_bytes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PreAggregateMaterializationTableName,
        (table) => {
            table.bigInteger(TotalBytesColumnName).nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            PreAggregateMaterializationTableName,
            TotalBytesColumnName,
        )
    ) {
        await knex.schema.alterTable(
            PreAggregateMaterializationTableName,
            (t) => {
                t.dropColumns(TotalBytesColumnName);
            },
        );
    }
}
