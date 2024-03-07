import { type Knex } from 'knex';

const SavedChartAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedChartAdditionalMetricsTableName,
        (tableBuilder) => {
            tableBuilder.jsonb('filters').nullable();
            tableBuilder.string('base_dimension_name').nullable();
            tableBuilder
                .uuid('uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .unique();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedChartAdditionalMetricsTableName,
        (tableBuilder) => {
            tableBuilder.dropColumns('filters', 'base_dimension_name', 'uuid');
        },
    );
}
