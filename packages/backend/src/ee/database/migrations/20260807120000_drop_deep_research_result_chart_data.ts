import { type Knex } from 'knex';

const TABLE = 'ai_deep_research_runs';
const COLUMN = 'result_chart_data';

/**
 * Report charts are derived on demand from the execution each `<chart>`
 * reference names, so this column has had nothing to hold: every write since
 * the chart rework set it null and the read paths that consulted it are gone.
 */
export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(TABLE, COLUMN)) {
        await knex.schema.alterTable(TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(TABLE, COLUMN))) {
        await knex.schema.alterTable(TABLE, (table) => {
            table.jsonb(COLUMN).nullable();
        });
    }
}
