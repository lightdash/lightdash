import { DashboardSummaryTone } from '@lightdash/common';
import { Knex } from 'knex';

const DASHBOARD_SUMMARIES_TABLE_NAME = 'dashboard_summaries';
const ToneColumnName = 'tone';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(DASHBOARD_SUMMARIES_TABLE_NAME)) {
        await knex.schema.alterTable(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            (table) => {
                table
                    .text(ToneColumnName)
                    .notNullable()
                    .defaultTo(DashboardSummaryTone.FRIENDLY);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            ToneColumnName,
        )
    ) {
        await knex.schema.alterTable(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            (table) => {
                table.dropColumn(ToneColumnName);
            },
        );
    }
}
