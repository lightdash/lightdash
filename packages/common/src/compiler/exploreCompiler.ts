import { SupportedDbtAdapter } from '../types/dbt';
import { CompileError } from '../types/errors';
import {
    CompiledExploreJoin,
    CompiledTable,
    Explore,
    ExploreJoin,
    Table,
} from '../types/explore';
import {
    CompiledDimension,
    CompiledMetric,
    Dimension,
    isNonAggregateMetric,
    Metric,
    MetricType,
} from '../types/field';
import assertUnreachable from '../utils/assertUnreachable';
import { renderFilterRuleSql } from './filtersCompiler';

export const getQuoteChar = (targetDatabase: SupportedDbtAdapter): string => {
    switch (targetDatabase) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
            return '"';
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.DATABRICKS:
            return '`';
        default:
            return '"';
    }
};
export const lightdashVariablePattern = /\$\{([a-zA-Z0-9_.]+)\}/g;

type Reference = {
    refTable: string;
    refName: string;
};
const getParsedReference = (ref: string, currentTable: string): Reference => {
    // Reference to another dimension
    const split = ref.split('.');
    if (split.length > 2) {
        throw new CompileError(
            `Model "${currentTable}" cannot resolve dimension reference: \${${ref}}`,
            {},
        );
    }
    const refTable = split.length === 1 ? currentTable : split[0];
    const refName = split.length === 1 ? split[0] : split[1];

    return { refTable, refName };
};

export const parseAllReferences = (
    raw: string,
    currentTable: string,
): Reference[] =>
    (raw.match(lightdashVariablePattern) || []).map((value) =>
        getParsedReference(value.slice(2), currentTable),
    );

export const compileDimensionSql = (
    dimension: Dimension,
    tables: Record<string, Table>,
    quoteChar: string,
): { sql: string; tablesReferences: Set<string> } => {
    // Dimension might have references to other dimensions
    // Check we don't reference ourself
    const currentRef = `${dimension.table}.${dimension.name}`;
    const currentShortRef = dimension.name;
    let tablesReferences = new Set([dimension.table]);
    const sql = dimension.sql.replace(lightdashVariablePattern, (_, p1) => {
        if ([currentShortRef, currentRef].includes(p1)) {
            throw new CompileError(
                `Dimension "${dimension.name}" in table "${dimension.table}" has a sql string referencing itself: "${dimension.sql}"`,
                {},
            );
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const compiledReference = compileDimensionReference(
            p1,
            tables,
            dimension.table,
            quoteChar,
        );
        tablesReferences = new Set([
            ...tablesReferences,
            ...compiledReference.tablesReferences,
        ]);
        return compiledReference.sql;
    });
    return { sql, tablesReferences };
};

const compileDimensionReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
    quoteChar: string,
): { sql: string; tablesReferences: Set<string> } => {
    // Reference to current table
    if (ref === 'TABLE') {
        return {
            sql: `${quoteChar}${currentTable}${quoteChar}`,
            tablesReferences: new Set([currentTable]),
        };
    }
    const { refTable, refName } = getParsedReference(ref, currentTable);

    const referencedDimension = tables[refTable]?.dimensions[refName];
    if (referencedDimension === undefined) {
        throw new CompileError(
            `Model "${currentTable}" has a dimension reference: \${${ref}} which matches no dimension`,
            {},
        );
    }
    const compiledDimension = compileDimensionSql(
        referencedDimension,
        tables,
        quoteChar,
    );

    return {
        sql: `(${compiledDimension.sql})`,
        tablesReferences: new Set([
            refTable,
            ...compiledDimension.tablesReferences,
        ]),
    };
};

function compileDimension(
    dimension: Dimension,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledDimension {
    const compiledDimension = compileDimensionSql(dimension, tables, quoteChar);
    return {
        ...dimension,
        compiledSql: compiledDimension.sql,
        tablesReferences: Array.from(compiledDimension.tablesReferences),
    };
}

const compileMetricReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
    quoteChar: string,
): { sql: string; tablesReferences: Set<string> } => {
    // Reference to current table
    if (ref === 'TABLE') {
        return {
            sql: `${quoteChar}${currentTable}${quoteChar}`,
            tablesReferences: new Set([currentTable]),
        };
    }
    const { refTable, refName } = getParsedReference(ref, currentTable);

    const referencedMetric = tables[refTable]?.metrics[refName];
    if (referencedMetric === undefined) {
        throw new CompileError(
            `Model "${currentTable}" has a metric reference: \${${ref}} which matches no metric`,
            {},
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const compiledMetric = compileMetricSql(
        referencedMetric,
        tables,
        quoteChar,
    );
    return {
        sql: `(${compiledMetric.sql})`,
        tablesReferences: new Set([
            refTable,
            ...compiledMetric.tablesReferences,
        ]),
    };
};

export const renderSqlType = (sql: string, type: MetricType): string => {
    switch (type) {
        case MetricType.AVERAGE:
            return `AVG(${sql})`;
        case MetricType.COUNT:
            return `COUNT(${sql})`;
        case MetricType.COUNT_DISTINCT:
            return `COUNT(DISTINCT ${sql})`;
        case MetricType.MAX:
            return `MAX(${sql})`;
        case MetricType.MIN:
            return `MIN(${sql})`;
        case MetricType.SUM:
            return `SUM(${sql})`;
        case MetricType.NUMBER:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.BOOLEAN:
            break;
        default:
            return assertUnreachable(
                type,
                new CompileError(
                    `No SQL render function implemented for metric with type "${type}"`,
                ),
            );
    }
    return sql;
};
export const compileMetricSql = (
    metric: Metric,
    tables: Record<string, Table>,
    quoteChar: string,
): { sql: string; tablesReferences: Set<string> } => {
    const compileReference = isNonAggregateMetric(metric)
        ? compileMetricReference
        : compileDimensionReference;
    // Metric might have references to other dimensions
    if (!tables[metric.table]) {
        throw new CompileError(
            `Metric "${metric.name}" references a table "${metric.table}" which matches no model`,
            {},
        );
    }
    const currentRef = `${metric.table}.${metric.name}`;
    const currentShortRef = metric.name;
    let tablesReferences = new Set([metric.table]);
    let renderedSql = metric.sql.replace(lightdashVariablePattern, (_, p1) => {
        if ([currentShortRef, currentRef].includes(p1)) {
            throw new CompileError(
                `Metric "${metric.name}" in table "${metric.table}" has a sql string referencing itself: "${metric.sql}"`,
                {},
            );
        }
        const compiledReference = compileReference(
            p1,
            tables,
            metric.table,
            quoteChar,
        );
        tablesReferences = new Set([
            ...tablesReferences,
            ...compiledReference.tablesReferences,
        ]);
        return compiledReference.sql;
    });
    if (metric.filters !== undefined && metric.filters.length > 0) {
        const conditions = metric.filters.map((filter) => {
            const { refTable, refName } = getParsedReference(
                filter.target.fieldId,
                metric.table,
            );
            const dimensionField = tables[refTable]?.dimensions[refName];
            if (!dimensionField) {
                throw new Error(
                    `Filter has a reference to an unknown dimension: ${filter.target.fieldId}`,
                );
            }
            const compiledDimension = compileDimension(
                dimensionField,
                tables,
                quoteChar,
            );
            return renderFilterRuleSql(filter, compiledDimension, quoteChar);
        });
        renderedSql = `CASE WHEN (${conditions.join(
            ' AND ',
        )}) THEN (${renderedSql}) ELSE NULL END`;
    }
    const compiledSql = renderSqlType(renderedSql, metric.type);

    return { sql: compiledSql, tablesReferences };
};

export const compileExploreJoinSql = (
    join: ExploreJoin,
    tables: Record<string, Table>,
    quoteChar: string,
): string =>
    // Sql join contains references to dimensions
    join.sqlOn.replace(
        lightdashVariablePattern,
        (_, p1) =>
            compileDimensionReference(p1, tables, join.table, quoteChar).sql,
    );

export const compileMetric = (
    metric: Metric,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledMetric => {
    const compiledMetric = compileMetricSql(metric, tables, quoteChar);
    return {
        ...metric,
        compiledSql: compiledMetric.sql,
        tablesReferences: Array.from(compiledMetric.tablesReferences),
    };
};

const compileJoin = (
    join: ExploreJoin,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledExploreJoin => ({
    ...join,
    compiledSqlOn: compileExploreJoinSql(join, tables, quoteChar),
});

const compileTable = (
    table: Table,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledTable => {
    const dimensions: Record<string, CompiledDimension> = Object.keys(
        table.dimensions,
    ).reduce(
        (prev, dimensionKey) => ({
            ...prev,
            [dimensionKey]: compileDimension(
                table.dimensions[dimensionKey],
                tables,
                quoteChar,
            ),
        }),
        {},
    );
    const metrics: Record<string, CompiledMetric> = Object.keys(
        table.metrics,
    ).reduce(
        (prev, metricKey) => ({
            ...prev,
            [metricKey]: compileMetric(
                table.metrics[metricKey],
                tables,
                quoteChar,
            ),
        }),
        {},
    );
    return {
        ...table,
        dimensions,
        metrics,
    };
};

export type UncompiledExplore = {
    name: string;
    label: string;
    tags: string[];
    baseTable: string;
    joinedTables: ExploreJoin[];
    tables: Record<string, Table>;
    targetDatabase: SupportedDbtAdapter;
};
export const compileExplore = ({
    name,
    label,
    tags,
    baseTable,
    joinedTables,
    tables,
    targetDatabase,
}: UncompiledExplore): Explore => {
    // Check tables are correctly declared
    if (!tables[baseTable]) {
        throw new CompileError(
            `Failed to compile explore "${name}". Tried to find base table but cannot find table with name "${baseTable}"`,
            {},
        );
    }
    joinedTables.forEach((join) => {
        if (!tables[join.table]) {
            throw new CompileError(
                `Failed to compile explore "${name}". Tried to join table "${join.table}" to "${baseTable}" but cannot find table with name "${join.table}"`,
                {},
            );
        }
    });
    const joinedTableNames = [baseTable, ...joinedTables.map((j) => j.table)];
    const joined = joinedTableNames.reduce(
        (prev, tableName) => ({ ...prev, [tableName]: tables[tableName] }),
        {},
    );
    const quoteChar = getQuoteChar(targetDatabase);
    const compiledTables: Record<string, CompiledTable> = Object.keys(
        tables,
    ).reduce((prev, tableName) => {
        if (joinedTableNames.find((t) => t === tableName)) {
            return {
                ...prev,
                [tableName]: compileTable(tables[tableName], joined, quoteChar),
            };
        }
        return prev;
    }, {});
    const compiledJoins: CompiledExploreJoin[] = joinedTables.map((j) =>
        compileJoin(j, joined, quoteChar),
    );
    return {
        name,
        label,
        tags,
        baseTable,
        joinedTables: compiledJoins,
        tables: compiledTables,
        targetDatabase,
    };
};
