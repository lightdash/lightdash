import { type Explore, type MetricQuery } from '@lightdash/common';
import {
    getLiveDefinitionName,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { compileSqlQuery } from '../../query/compileSql';
import { getDatabricksTableSql } from './explores';
import { DATABRICKS_SQL_BUILDER } from './sql';

/**
 * Compiles a metric query on a Databricks explore into one Databricks SQL
 * statement with the warehouse SQL builder. The explore's table name is a
 * CTE over the system table it reads, so field SQL stays short.
 */
export const compileDatabricksQuery = ({
    explore,
    metricQuery,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
}): LiveCompiledRequest => {
    const definitionName = getLiveDefinitionName(explore);
    const quote = DATABRICKS_SQL_BUILDER.getFieldQuoteChar();
    const compiled = compileSqlQuery({
        explore,
        metricQuery,
        warehouseSqlBuilder: DATABRICKS_SQL_BUILDER,
        // System tables keep UTC timestamps
        timezone: 'UTC',
    });
    return {
        ...compiled,
        query: [
            `WITH ${quote}${definitionName}${quote} AS (`,
            getDatabricksTableSql(definitionName),
            ')',
            compiled.query,
        ].join('\n'),
    };
};
