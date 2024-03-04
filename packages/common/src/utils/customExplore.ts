import { SupportedDbtAdapter } from '../types/dbt';
import { Explore } from '../types/explore';
import {
    CompiledDimension,
    DimensionType,
    FieldType,
    friendlyName,
} from '../types/field';
import { MetricQuery } from '../types/metricQuery';
import { ApiSqlQueryResults } from '../types/sqlRunner';

export const CUSTOM_EXPLORE_ALIAS_NAME = 'custom_explore';

export const convertQueryResultsToFields = (
    fields: Record<string, { type: DimensionType }>,
): Record<string, CompiledDimension> =>
    Object.entries(fields).reduce(
        (acc, [key, type]) => ({
            ...acc,
            [key]: {
                fieldType: FieldType.DIMENSION,
                type: type.type,
                name: key,
                label: friendlyName(key),
                table: CUSTOM_EXPLORE_ALIAS_NAME,
                tableLabel: '',
                // sql: `${CUSTOM_EXPLORE_ALIAS_NAME}.${key}`,
                // compiledSql: `${CUSTOM_EXPLORE_ALIAS_NAME}.${key}`,
                sql: `"${CUSTOM_EXPLORE_ALIAS_NAME}"."${key}"`,
                compiledSql: `"${CUSTOM_EXPLORE_ALIAS_NAME}"."${key}"`,
                tablesReferences: [CUSTOM_EXPLORE_ALIAS_NAME],
                hidden: false,
            },
        }),
        {},
    );

export const getCustomExploreFromQueryResultsAndSql = (
    sql: string,
    queryResults: ApiSqlQueryResults,
): Explore => ({
    name: CUSTOM_EXPLORE_ALIAS_NAME,
    label: 'Untitled explore',
    tags: [],
    baseTable: CUSTOM_EXPLORE_ALIAS_NAME,
    joinedTables: [],
    tables: {
        custom_explore: {
            // TODO: support metrics
            name: CUSTOM_EXPLORE_ALIAS_NAME,
            label: 'Custom Explore',
            // TODO: support warehouse...
            database: 'postgres',
            schema: 'jaffle',
            dimensions: convertQueryResultsToFields(queryResults.fields),
            sqlTable: `(
  ${sql}
)`,
            metrics: {},
            lineageGraph: {},
        },
    },
    // TODO: support warehouse...
    targetDatabase: SupportedDbtAdapter.POSTGRES,
});

export const getMetricQueryFromResults = (
    results: ApiSqlQueryResults,
): MetricQuery => ({
    exploreName: CUSTOM_EXPLORE_ALIAS_NAME,
    dimensions: Object.keys(results.fields).map(
        (f) => `${CUSTOM_EXPLORE_ALIAS_NAME}_${f}`,
    ),
    metrics: [],
    filters: {},
    sorts: [],
    limit: 0,
    tableCalculations: [],
});
