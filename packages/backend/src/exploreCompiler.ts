import {
    CompiledDimension,
    CompiledExploreJoin,
    CompiledMetric,
    CompiledTable,
    Dimension,
    Explore,
    ExploreJoin,
    isNonAggregateMetric,
    Metric,
    MetricType,
    Table,
} from 'common';
import { CompileError } from './errors';

const lightdashVariablePattern = /\$\{([a-zA-Z0-9_.]+)\}/g;

const getParsedReference = (
    ref: string,
    currentTable: string,
): { refTable: string; refName: string } => {
    // Reference to another dimension
    const split = ref.split('.');
    if (split.length > 2) {
        throw new CompileError(
            `Model ${currentTable} cannot resolve dimension reference: \${${ref}}`,
            {},
        );
    }
    const refTable = split.length === 1 ? currentTable : split[0];
    const refName = split.length === 1 ? split[0] : split[1];

    return { refTable, refName };
};

export const compileDimensionSql = (
    dimension: Dimension,
    tables: Record<string, Table>,
): string => {
    // Dimension might have references to other dimensions
    // Check we don't reference ourself
    const currentRef = `${dimension.table}.${dimension.name}`;
    return dimension.sql.replace(lightdashVariablePattern, (_, p1) => {
        if (p1 === currentRef) {
            throw new CompileError(
                `Dimension ${dimension.name} in table ${dimension.table} has a sql string referencing itself: "${dimension.sql}"`,
                {},
            );
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return compileDimensionReference(p1, tables, dimension.table);
    });
};

const compileDimensionReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
): string => {
    // Reference to current table
    if (ref === 'TABLE') {
        return currentTable;
    }
    const { refTable, refName } = getParsedReference(ref, currentTable);

    const referencedDimension = tables[refTable]?.dimensions[refName];
    if (referencedDimension === undefined) {
        throw new CompileError(
            `Model ${currentTable} has a dimension reference: \${${ref}} which matches no dimension`,
            {},
        );
    }

    return `(${compileDimensionSql(referencedDimension, tables)})`;
};

const compileMetricReference = (
    ref: string,
    tables: Record<string, Table>,
    currentTable: string,
) => {
    // Reference to current table
    if (ref === 'TABLE') {
        return currentTable;
    }
    const { refTable, refName } = getParsedReference(ref, currentTable);

    const referencedMetric = tables[refTable]?.metrics[refName];
    if (referencedMetric === undefined) {
        throw new CompileError(
            `Model ${currentTable} has a metric reference: \${${ref}} which matches no metric`,
            {},
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return `(${compileMetricSql(referencedMetric, tables)})`;
};

export const compileMetricSql = (
    metric: Metric,
    tables: Record<string, Table>,
): string => {
    const compileReference = isNonAggregateMetric(metric)
        ? compileMetricReference
        : compileDimensionReference;
    // Metric might have references to other dimensions
    const renderedSql = metric.sql.replace(lightdashVariablePattern, (_, p1) =>
        compileReference(p1, tables, metric.table),
    );
    const metricType = metric.type;
    switch (metricType) {
        case MetricType.AVERAGE:
            return `AVG(${renderedSql})`;
        case MetricType.COUNT:
            return `COUNT(${renderedSql})`;
        case MetricType.COUNT_DISTINCT:
            return `COUNT(DISTINCT ${renderedSql})`;
        case MetricType.MAX:
            return `MAX(${renderedSql})`;
        case MetricType.MIN:
            return `MIN(${renderedSql})`;
        case MetricType.SUM:
            return `SUM(${renderedSql})`;
        case MetricType.NUMBER:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.BOOLEAN:
            return renderedSql;
        default:
            // eslint-disable-next-line no-case-declarations
            const nope: never = metricType;
            throw new CompileError(
                `No SQL render function implemented for metric with type ${metricType}`,
                {},
            );
    }
};

export const compileExploreJoinSql = (
    join: ExploreJoin,
    tables: Record<string, Table>,
): string =>
    // Sql join contains references to dimensions
    join.sqlOn.replace(lightdashVariablePattern, (_, p1) =>
        compileDimensionReference(p1, tables, join.table),
    );
const compileDimension = (
    dimension: Dimension,
    tables: Record<string, Table>,
): CompiledDimension => ({
    ...dimension,
    compiledSql: compileDimensionSql(dimension, tables),
});

const compileMetric = (
    metric: Metric,
    tables: Record<string, Table>,
): CompiledMetric => ({
    ...metric,
    compiledSql: compileMetricSql(metric, tables),
});

const compileJoin = (
    join: ExploreJoin,
    tables: Record<string, Table>,
): CompiledExploreJoin => ({
    ...join,
    compiledSqlOn: compileExploreJoinSql(join, tables),
});

const compileTable = (
    table: Table,
    tables: Record<string, Table>,
): CompiledTable => {
    const dimensions: Record<string, CompiledDimension> = Object.keys(
        table.dimensions,
    ).reduce(
        (prev, dimensionKey) => ({
            ...prev,
            [dimensionKey]: compileDimension(
                table.dimensions[dimensionKey],
                tables,
            ),
        }),
        {},
    );
    const metrics: Record<string, CompiledMetric> = Object.keys(
        table.metrics,
    ).reduce(
        (prev, metricKey) => ({
            ...prev,
            [metricKey]: compileMetric(table.metrics[metricKey], tables),
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
    baseTable: string;
    joinedTables: ExploreJoin[];
    tables: Record<string, Table>;
};
export const compileExplore = ({
    name,
    baseTable,
    joinedTables,
    tables,
}: UncompiledExplore): Explore => {
    // Check tables are correctly declared
    if (!tables[baseTable]) {
        throw new CompileError(
            `Failed to compile explore ${name}. Tried to find base table but cannot find table with name ${baseTable}`,
            {},
        );
    }
    joinedTables.forEach((join) => {
        if (!tables[join.table]) {
            throw new CompileError(
                `Failed to compile explore ${name}. Tried to join table ${join.table} to ${baseTable} but cannot find table with name ${join.table}`,
                {},
            );
        }
    });
    const joinedTableNames = [baseTable, ...joinedTables.map((j) => j.table)];
    const joined = joinedTableNames.reduce(
        (prev, tableName) => ({ ...prev, [tableName]: tables[tableName] }),
        {},
    );
    const compiledTables: Record<string, CompiledTable> = Object.keys(
        tables,
    ).reduce((prev, tableName) => {
        if (joinedTableNames.find((t) => t === tableName)) {
            return {
                ...prev,
                [tableName]: compileTable(tables[tableName], joined),
            };
        }
        return prev;
    }, {});
    const compiledJoins: CompiledExploreJoin[] = joinedTables.map((j) =>
        compileJoin(j, joined),
    );
    return {
        name,
        baseTable,
        joinedTables: compiledJoins,
        tables: compiledTables,
    };
};
