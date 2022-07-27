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
): string => {
    // Dimension might have references to other dimensions
    // Check we don't reference ourself
    const currentRef = `${dimension.table}.${dimension.name}`;
    const currentShortRef = dimension.name;
    return dimension.sql.replace(lightdashVariablePattern, (_, p1) => {
        if ([currentShortRef, currentRef].includes(p1)) {
            throw new CompileError(
                `Dimension "${dimension.name}" in table "${dimension.table}" has a sql string referencing itself: "${dimension.sql}"`,
                {},
            );
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return compileDimensionReference(
            p1,
            tables,
            dimension.table,
            quoteChar,
        );
    });
};

const compileDimensionReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
    quoteChar: string,
): string => {
    // Reference to current table
    if (ref === 'TABLE') {
        return `${quoteChar}${currentTable}${quoteChar}`;
    }
    const { refTable, refName } = getParsedReference(ref, currentTable);

    const referencedDimension = tables[refTable]?.dimensions[refName];
    if (referencedDimension === undefined) {
        throw new CompileError(
            `Model "${currentTable}" has a dimension reference: \${${ref}} which matches no dimension`,
            {},
        );
    }

    return `(${compileDimensionSql(referencedDimension, tables, quoteChar)})`;
};

const compileMetricReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
    quoteChar: string,
) => {
    // Reference to current table
    if (ref === 'TABLE') {
        return `${quoteChar}${currentTable}${quoteChar}`;
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
    return `(${compileMetricSql(referencedMetric, tables, quoteChar)})`;
};

export const compileMetricSql = (
    metric: Metric,
    tables: Record<string, Table>,
    quoteChar: string,
): string => {
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
    let renderedSql = metric.sql.replace(lightdashVariablePattern, (_, p1) => {
        if ([currentShortRef, currentRef].includes(p1)) {
            throw new CompileError(
                `Metric "${metric.name}" in table "${metric.table}" has a sql string referencing itself: "${metric.sql}"`,
                {},
            );
        }
        return compileReference(p1, tables, metric.table, quoteChar);
    });
    const metricType = metric.type;
    switch (metricType) {
        case MetricType.AVERAGE:
            renderedSql = `AVG(${renderedSql})`;
            break;
        case MetricType.COUNT:
            renderedSql = `COUNT(${renderedSql})`;
            break;
        case MetricType.COUNT_DISTINCT:
            renderedSql = `COUNT(DISTINCT ${renderedSql})`;
            break;
        case MetricType.MAX:
            renderedSql = `MAX(${renderedSql})`;
            break;
        case MetricType.MIN:
            renderedSql = `MIN(${renderedSql})`;
            break;
        case MetricType.SUM:
            renderedSql = `SUM(${renderedSql})`;
            break;
        case MetricType.NUMBER:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.BOOLEAN:
            break;
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = metricType;
            throw new CompileError(
                `No SQL render function implemented for metric with type "${metricType}"`,
                {},
            );
    }

    return renderedSql;
};

export const compileExploreJoinSql = (
    join: ExploreJoin,
    tables: Record<string, Table>,
    quoteChar: string,
): string =>
    // Sql join contains references to dimensions
    join.sqlOn.replace(lightdashVariablePattern, (_, p1) =>
        compileDimensionReference(p1, tables, join.table, quoteChar),
    );
const compileDimension = (
    dimension: Dimension,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledDimension => ({
    ...dimension,
    compiledSql: compileDimensionSql(dimension, tables, quoteChar),
});

const compileMetric = (
    metric: Metric,
    tables: Record<string, Table>,
    quoteChar: string,
): CompiledMetric => ({
    ...metric,
    compiledSql: compileMetricSql(metric, tables, quoteChar),
});

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
