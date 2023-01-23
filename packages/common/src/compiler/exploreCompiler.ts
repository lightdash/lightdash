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
    friendlyName,
    isNonAggregateMetric,
    Metric,
    MetricType,
} from '../types/field';
import assertUnreachable from '../utils/assertUnreachable';
import { renderFilterRuleSql } from './filtersCompiler';

export const getFieldQuoteChar = (
    targetDatabase: SupportedDbtAdapter,
): string => {
    switch (targetDatabase) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.TRINO:
            return '"';
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.DATABRICKS:
            return '`';
        default:
            return assertUnreachable(
                targetDatabase,
                `field quote char not found for ${targetDatabase}`,
            );
    }
};

export const getStringQuoteChar = (
    targetDatabase: SupportedDbtAdapter,
): string => {
    switch (targetDatabase) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.TRINO:
            return "'";
        default:
            return assertUnreachable(
                targetDatabase,
                `string quote char not found for ${targetDatabase}`,
            );
    }
};

export const getEscapeStringQuoteChar = (
    targetDatabase: SupportedDbtAdapter,
): string => {
    switch (targetDatabase) {
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.BIGQUERY:
            return '\\';
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.TRINO:
            return "'";
        default:
            return assertUnreachable(
                targetDatabase,
                `string quote char not found for ${targetDatabase}`,
            );
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
    fieldQuoteChar: string,
    stringQuoteChar: string,
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
            fieldQuoteChar,
            stringQuoteChar,
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
    fieldQuoteChar: string,
    stringQuoteChar: string,
): { sql: string; tablesReferences: Set<string> } => {
    // Reference to current table
    if (ref === 'TABLE') {
        return {
            sql: `${fieldQuoteChar}${currentTable}${fieldQuoteChar}`,
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
        fieldQuoteChar,
        stringQuoteChar,
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
    fieldQuoteChar: string,
    stringQuoteChar: string,
): CompiledDimension {
    const compiledDimension = compileDimensionSql(
        dimension,
        tables,
        fieldQuoteChar,
        stringQuoteChar,
    );
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
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    targetDatabase: SupportedDbtAdapter,
): { sql: string; tablesReferences: Set<string> } => {
    // Reference to current table
    if (ref === 'TABLE') {
        return {
            sql: `${fieldQuoteChar}${currentTable}${fieldQuoteChar}`,
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
        fieldQuoteChar,
        stringQuoteChar,
        escapeStringQuoteChar,
        targetDatabase,
    );
    return {
        sql: `(${compiledMetric.sql})`,
        tablesReferences: new Set([
            refTable,
            ...compiledMetric.tablesReferences,
        ]),
    };
};

const renderSqlType = (
    sql: string,
    type: MetricType,
    targetDatabase: SupportedDbtAdapter,
    percentile: number | undefined = 50,
): string => {
    switch (type) {
        case MetricType.PERCENTILE:
            switch (targetDatabase) {
                case SupportedDbtAdapter.BIGQUERY:
                    return `APPROX_QUANTILES(${sql}, 100)[OFFSET(${percentile})]`;
                case SupportedDbtAdapter.DATABRICKS:
                    return `PERCENTILE(${sql}, ${percentile / 100})`;
                case SupportedDbtAdapter.TRINO:
                    return `APPROX_PERCENTILE(${sql}, ${percentile / 100})`;
                case SupportedDbtAdapter.POSTGRES:
                case SupportedDbtAdapter.REDSHIFT:
                case SupportedDbtAdapter.SNOWFLAKE:
                    return `PERCENTILE_CONT(${
                        percentile / 100
                    }) WITHIN GROUP (ORDER BY ${sql})`;
                default:
                    return `PERCENTILE_CONT(${
                        percentile / 100
                    }) WITHIN GROUP (ORDER BY ${sql})`;
            }
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
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    targetDatabase: SupportedDbtAdapter,
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
            fieldQuoteChar,
            stringQuoteChar,
            escapeStringQuoteChar,
            targetDatabase,
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
                throw new CompileError(
                    `Filter for metric "${metric.name}" has a reference to an unknown dimension: ${filter.target.fieldId}`,
                );
            }
            const compiledDimension = compileDimension(
                dimensionField,
                tables,
                fieldQuoteChar,
                stringQuoteChar,
            );
            if (compiledDimension.tablesReferences) {
                tablesReferences = new Set([
                    ...tablesReferences,
                    ...compiledDimension.tablesReferences,
                ]);
            }
            return renderFilterRuleSql(
                filter,
                compiledDimension,
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
            );
        });
        renderedSql = `CASE WHEN (${conditions.join(
            ' AND ',
        )}) THEN (${renderedSql}) ELSE NULL END`;
    }
    const compiledSql = renderSqlType(
        renderedSql,
        metric.type,
        targetDatabase,
        metric.percentile,
    );

    return { sql: compiledSql, tablesReferences };
};

export const compileExploreJoinSql = (
    join: ExploreJoin,
    tables: Record<string, Table>,
    fieldQuoteChar: string,
    stringQuoteChar: string,
): string =>
    // Sql join contains references to dimensions
    join.sqlOn.replace(
        lightdashVariablePattern,
        (_, p1) =>
            compileDimensionReference(
                p1,
                tables,
                join.table,
                fieldQuoteChar,
                stringQuoteChar,
            ).sql,
    );

export const compileMetric = (
    metric: Metric,
    tables: Record<string, Table>,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    targetDatabase: SupportedDbtAdapter,
): CompiledMetric => {
    const compiledMetric = compileMetricSql(
        metric,
        tables,
        fieldQuoteChar,
        stringQuoteChar,
        escapeStringQuoteChar,
        targetDatabase,
    );
    metric.showUnderlyingValues?.forEach((dimReference) => {
        const { refTable, refName } = getParsedReference(
            dimReference,
            metric.table,
        );
        const isValidReference = !!tables[refTable]?.dimensions[refName];
        if (!isValidReference) {
            throw new CompileError(
                `"show_underlying_values" for metric "${metric.name}" has a reference to an unknown dimension: ${dimReference}`,
            );
        }
    });
    return {
        ...metric,
        compiledSql: compiledMetric.sql,
        tablesReferences: Array.from(compiledMetric.tablesReferences),
    };
};

const compileJoin = (
    join: ExploreJoin,
    tables: Record<string, Table>,
    fieldQuoteChar: string,
    stringQuoteChar: string,
): CompiledExploreJoin => ({
    table: join.alias || join.table,
    sqlOn: join.sqlOn,
    compiledSqlOn: compileExploreJoinSql(
        { table: join.alias || join.table, sqlOn: join.sqlOn },
        tables,
        fieldQuoteChar,
        stringQuoteChar,
    ),
});

const compileTable = (
    table: Table,
    tables: Record<string, Table>,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    targetDatabase: SupportedDbtAdapter,
): CompiledTable => {
    const dimensions: Record<string, CompiledDimension> = Object.keys(
        table.dimensions,
    ).reduce(
        (prev, dimensionKey) => ({
            ...prev,
            [dimensionKey]: compileDimension(
                table.dimensions[dimensionKey],
                tables,
                fieldQuoteChar,
                stringQuoteChar,
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
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
                targetDatabase,
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
    // Check that base table and joined tables exist
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
    const aliases = [
        baseTable,
        ...joinedTables.map((join) => join.alias || join.table),
    ];
    if (aliases.length !== new Set(aliases).size) {
        throw new CompileError(
            `Failed to compile explore "${name}". Cannot join to the same table multiple times table in an explore. Use an 'alias'`,
            {},
        );
    }
    const includedTables = joinedTables.reduce<Record<string, Table>>(
        (prev, join) => ({
            ...prev,
            [join.alias || join.table]: {
                ...tables[join.table],
                name: join.alias || tables[join.table].name,
                label:
                    join.label ||
                    (join.alias && friendlyName(join.alias)) ||
                    tables[join.table].label,
            },
        }),
        { [baseTable]: tables[baseTable] },
    );

    const fieldQuoteChar = getFieldQuoteChar(targetDatabase);
    const stringQuoteChar = getStringQuoteChar(targetDatabase);
    const escapeStringQuoteChar = getEscapeStringQuoteChar(targetDatabase);

    const compiledTables: Record<string, CompiledTable> = aliases.reduce(
        (prev, tableName) => ({
            ...prev,
            [tableName]: compileTable(
                includedTables[tableName],
                includedTables,
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
                targetDatabase,
            ),
        }),
        {},
    );
    const compiledJoins: CompiledExploreJoin[] = joinedTables.map((j) =>
        compileJoin(j, includedTables, fieldQuoteChar, stringQuoteChar),
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
