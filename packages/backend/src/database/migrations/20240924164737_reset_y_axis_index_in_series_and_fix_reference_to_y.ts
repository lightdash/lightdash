import {
    CartesianChartDisplay,
    isVizPieChartConfig,
    isVizTableConfig,
    VizChartConfig,
} from '@lightdash/common';
import { Knex } from 'knex';
import { SavedSqlVersionsTableName } from '../entities/savedSql';

export async function up(knex: Knex): Promise<void> {
    const rows = await knex(SavedSqlVersionsTableName)
        .select('saved_sql_uuid', 'config')
        .whereRaw("config::jsonb -> 'display' -> 'series' IS NOT NULL");

    const updatePromises = rows.map((row) => {
        const config = row.config as VizChartConfig;
        if (
            !isVizTableConfig(config) &&
            !isVizPieChartConfig(config) &&
            config.display &&
            config.display.series
        ) {
            const updatedSeries: CartesianChartDisplay['series'] = {};
            const yFields = config.fieldConfig?.y || [];

            for (const [key, value] of Object.entries(config.display.series)) {
                const yAxisIndex = value.yAxisIndex || 0;
                const matchingY = yFields[yAxisIndex];

                if (matchingY) {
                    const newKey = `${matchingY.reference}_${
                        matchingY.aggregation || 'count'
                    }`;

                    updatedSeries[newKey] = {
                        ...value,
                        yAxisIndex: 0,
                    };
                } else {
                    updatedSeries[key] = value;
                }
            }

            config.display.series = updatedSeries;

            return knex(SavedSqlVersionsTableName)
                .where('saved_sql_uuid', row.saved_sql_uuid)
                .update({
                    config,
                });
        }
        return Promise.resolve();
    });

    await Promise.all(updatePromises);
}

export async function down(knex: Knex): Promise<void> {
    // If needed, implement a way to revert the changes
    // This might be complex or impossible without storing the original data
    return knex.raw('SELECT 1');
}
