import { type Knex } from 'knex';
import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';

const VERSION_ALIAS = 'sqv';

/** A chart's latest version row, by the key `SavedChartModel.get` reads it: newest `created_at`. */
export const latestSavedChartVersionQuery = (
    database: Knex,
    columns: (string | Knex.Raw)[],
    savedQueryIdRef = `${SavedChartsTableName}.saved_query_id`,
): Knex.QueryBuilder =>
    database(`${SavedChartVersionsTableName} as ${VERSION_ALIAS}`)
        .select(columns)
        .whereRaw('?? = ??', [
            `${VERSION_ALIAS}.saved_query_id`,
            savedQueryIdRef,
        ])
        .orderBy(`${VERSION_ALIAS}.created_at`, 'desc')
        .limit(1);

/** Joins each `saved_queries` row to its latest version as `alias`, exposing the given version columns. */
export const joinLatestSavedChartVersion = (
    query: Knex.QueryBuilder,
    database: Knex,
    columns: string[],
    alias: string,
): Knex.QueryBuilder =>
    query.joinRaw('inner join lateral ? as ?? on true', [
        latestSavedChartVersionQuery(
            database,
            columns.map((column) => `${VERSION_ALIAS}.${column}`),
        ),
        alias,
    ]);

/** Whether a `saved_queries` row's latest version runs a pipeline, as a selectable column. */
export const isComposerChartSelect = (
    database: Knex,
    alias = 'is_composer_chart',
): Knex.Raw =>
    database.raw('? as ??', [
        latestSavedChartVersionQuery(database, [
            database.raw('?? is not null', [`${VERSION_ALIAS}.pipeline`]),
        ]),
        alias,
    ]);
