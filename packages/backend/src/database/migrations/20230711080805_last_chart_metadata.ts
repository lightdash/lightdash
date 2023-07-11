import { ChartKind } from '@lightdash/common';
import { Knex } from 'knex';

const chartTable = 'saved_queries';
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(chartTable, (table) => {
        table
            .string('last_version_chart_kind')
            .defaultTo(ChartKind.VERTICAL_BAR);
        table
            .timestamp('last_version_updated_at', { useTz: false })
            .defaultTo(knex.fn.now());
        table
            .uuid('last_version_updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(chartTable, (table) => {
        table.dropColumns(
            'last_version_chart_kind',
            'last_version_updated_at',
            'last_version_updated_by_user_uuid',
        );
    });
}
