import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('saved_queries_version_fields')) {
        await knex.schema.alterTable(
            'saved_queries_version_fields',
            (table) => {
                table.index(['saved_queries_version_id']);
            },
        );
    }
    if (await knex.schema.hasTable('saved_queries_version_sorts')) {
        await knex.schema.alterTable('saved_queries_version_sorts', (table) => {
            table.index(['saved_queries_version_id']);
        });
    }
    if (
        await knex.schema.hasTable('saved_queries_version_table_calculations')
    ) {
        await knex.schema.alterTable(
            'saved_queries_version_table_calculations',
            (table) => {
                table.index(['saved_queries_version_id']);
            },
        );
    }
    if (
        await knex.schema.hasTable('saved_queries_version_additional_metrics')
    ) {
        await knex.schema.alterTable(
            'saved_queries_version_additional_metrics',
            (table) => {
                table.index(['saved_queries_version_id']);
            },
        );
    }
    if (await knex.schema.hasTable('saved_queries_versions')) {
        await knex.schema.alterTable('saved_queries_versions', (table) => {
            table.index(['saved_query_id']);
        });
    }
    if (await knex.schema.hasTable('validations')) {
        await knex.schema.alterTable('validations', (table) => {
            table.index(['dashboard_uuid']);
            table.index(['saved_chart_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('saved_queries_version_fields')) {
        await knex.schema.alterTable(
            'saved_queries_version_fields',
            (table) => {
                table.dropIndex(['saved_queries_version_id']);
            },
        );
    }
    if (await knex.schema.hasTable('saved_queries_version_sorts')) {
        await knex.schema.alterTable('saved_queries_version_sorts', (table) => {
            table.dropIndex(['saved_queries_version_id']);
        });
    }
    if (
        await knex.schema.hasTable('saved_queries_version_table_calculations')
    ) {
        await knex.schema.alterTable(
            'saved_queries_version_table_calculations',
            (table) => {
                table.dropIndex(['saved_queries_version_id']);
            },
        );
    }
    if (
        await knex.schema.hasTable('saved_queries_version_additional_metrics')
    ) {
        await knex.schema.alterTable(
            'saved_queries_version_additional_metrics',
            (table) => {
                table.dropIndex(['saved_queries_version_id']);
            },
        );
    }
    if (await knex.schema.hasTable('saved_queries_versions')) {
        await knex.schema.alterTable('saved_queries_versions', (table) => {
            table.dropIndex(['saved_query_id']);
        });
    }
    if (await knex.schema.hasTable('validations')) {
        await knex.schema.alterTable('validations', (table) => {
            table.dropIndex(['dashboard_uuid']);
            table.dropIndex(['saved_chart_uuid']);
        });
    }
}
