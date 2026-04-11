import {
    assertUnreachable,
    ExploreCompiler,
    getErrorMessage,
    lightdashVariablePattern,
    preAggregateUtils,
    type AnyType,
    type Explore,
    type SupportedDbtAdapter,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import {
    Dialect,
    init,
    isInitialized,
    tokenize,
    transpile,
} from '@polyglot-sql/sdk';

const PLACEHOLDER_PATTERN =
    /\$\{(?:lightdash|ld)\.(?:attributes?|attr|user|parameters)\.[^}]+\}|\{%(?:[\s\S]*?)%\}/g;

const getDialect = (adapter: SupportedDbtAdapter): Dialect => {
    switch (adapter) {
        case 'postgres':
            return Dialect.PostgreSQL;
        case 'bigquery':
            return Dialect.BigQuery;
        case 'snowflake':
            return Dialect.Snowflake;
        case 'databricks':
            return Dialect.Databricks;
        case 'redshift':
            return Dialect.Redshift;
        case 'trino':
            return Dialect.Trino;
        case 'athena':
            return Dialect.Athena;
        case 'duckdb':
            return Dialect.DuckDB;
        case 'clickhouse':
            return Dialect.ClickHouse;
        default:
            return assertUnreachable(
                adapter,
                `Unsupported dbt adapter "${adapter}" for sql filter transpilation`,
            );
    }
};

const ensurePolyglotInitialized = async (): Promise<void> => {
    if (!isInitialized()) {
        await init();
    }
};

const getTokenType = (token: unknown): string | undefined =>
    token != null
        ? ((token as AnyType).token_type ?? (token as AnyType).tokenType)
        : undefined;

const isIdentifierToken = (token: unknown): boolean => {
    const tokenType = getTokenType(token);
    return tokenType === 'VAR' || tokenType === 'QUOTED_IDENTIFIER';
};

const isDotToken = (token: unknown): boolean =>
    getTokenType(token) === 'DOT' ||
    (token as AnyType | undefined)?.text === '.';

const isOpenParenToken = (token: unknown): boolean =>
    getTokenType(token) === 'L_PAREN' ||
    (token as AnyType | undefined)?.text === '(';

const normalizeIdentifier = (value: string): string => {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith('`') && value.endsWith('`'))
    ) {
        return value.slice(1, -1);
    }
    return value;
};

const isNonEmptyString = (value: string | undefined): value is string =>
    !!value;

const protectPlaceholders = (sql: string) => {
    const placeholders = new Map<string, string>();
    let index = 0;

    const protectedSql = sql.replace(PLACEHOLDER_PATTERN, (match) => {
        const sentinel = `__ld_placeholder_${index}__`;
        index += 1;
        placeholders.set(sentinel, match);
        return sentinel;
    });

    return {
        protectedSql,
        restore: (value: string) => {
            let restored = value;
            placeholders.forEach((original, sentinel) => {
                restored = restored.replaceAll(sentinel, original);
            });
            return restored;
        },
    };
};

const compileSqlFilterAgainstPreAggregateExplore = ({
    sql,
    tableName,
    preAggExplore,
    warehouseSqlBuilder,
}: {
    sql: string;
    tableName: string;
    preAggExplore: Explore;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): string => {
    const compiler = new ExploreCompiler(warehouseSqlBuilder);

    return sql.replace(
        lightdashVariablePattern,
        (_, reference) =>
            compiler.compileDimensionReference(
                reference,
                preAggExplore.tables,
                tableName,
                {
                    fieldType: 'sql_where',
                    fieldName: tableName,
                },
            ).sql,
    );
};

const getColumnReplacementMaps = ({
    sourceExplore,
    preAggExplore,
}: {
    sourceExplore: Explore;
    preAggExplore: Explore;
}): Map<string, Map<string, string>> =>
    Object.entries(sourceExplore.tables).reduce<
        Map<string, Map<string, string>>
    >((tableMaps, [tableName, sourceTable]) => {
        const targetTable = preAggExplore.tables[tableName];
        if (!targetTable) {
            return tableMaps;
        }

        const replacementMap = new Map<string, string>();

        Object.values(sourceTable.dimensions).forEach((sourceDimension) => {
            const simpleColumnName =
                preAggregateUtils.getSimpleSqlColumnName(sourceDimension);
            const targetDimension =
                targetTable.dimensions[sourceDimension.name];

            if (!simpleColumnName || !targetDimension) {
                return;
            }

            replacementMap.set(simpleColumnName, targetDimension.compiledSql);
        });

        [sourceTable.name, sourceTable.originalName]
            .filter(isNonEmptyString)
            .forEach((alias) => {
                tableMaps.set(alias, replacementMap);
            });

        return tableMaps;
    }, new Map<string, Map<string, string>>());

const rewriteRawColumnReferences = async ({
    sql,
    currentTableName,
    columnReplacementMaps,
}: {
    sql: string;
    currentTableName: string;
    columnReplacementMaps: Map<string, Map<string, string>>;
}): Promise<string> => {
    await ensurePolyglotInitialized();
    const tokenResult = tokenize(sql, Dialect.DuckDB);
    if (!tokenResult.success || !tokenResult.tokens) {
        return sql;
    }
    const { tokens } = tokenResult;

    const currentTableColumns = columnReplacementMaps.get(currentTableName);
    let result = '';
    let lastEnd = 0;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const nextToken = tokens[index + 1];
        const columnToken = tokens[index + 2];
        let didRewriteQualifiedReference = false;

        if (
            isIdentifierToken(token) &&
            isDotToken(nextToken) &&
            isIdentifierToken(columnToken)
        ) {
            const qualifier = normalizeIdentifier(token.text);
            const column = normalizeIdentifier(columnToken.text);
            const replacement = columnReplacementMaps
                .get(qualifier)
                ?.get(column);

            if (replacement) {
                result += sql.substring(lastEnd, token.span.start);
                result += `(${replacement})`;
                lastEnd = columnToken.span.end;
                index += 2;
                didRewriteQualifiedReference = true;
            }
        }

        if (!didRewriteQualifiedReference && isIdentifierToken(token)) {
            const previousToken = tokens[index - 1];
            const replacement =
                !isDotToken(previousToken) &&
                !isDotToken(nextToken) &&
                !isOpenParenToken(nextToken)
                    ? currentTableColumns?.get(normalizeIdentifier(token.text))
                    : undefined;

            if (replacement) {
                result += sql.substring(lastEnd, token.span.start);
                result += `(${replacement})`;
                lastEnd = token.span.end;
            }
        }
    }

    result += sql.substring(lastEnd);
    return result;
};

const transpileSqlFilterToDuckDb = async ({
    sql,
    sourceAdapter,
}: {
    sql: string;
    sourceAdapter: SupportedDbtAdapter;
}): Promise<string> => {
    if (sourceAdapter === 'duckdb') {
        return sql;
    }

    await ensurePolyglotInitialized();

    const { protectedSql, restore } = protectPlaceholders(
        `SELECT 1 WHERE ${sql}`,
    );
    const transpiled = transpile(
        protectedSql,
        getDialect(sourceAdapter),
        Dialect.DuckDB,
    );

    if (!transpiled.success || !transpiled.sql || transpiled.sql.length === 0) {
        throw new Error(
            `Failed to transpile sql_filter: ${transpiled.error ?? 'unknown error'}`,
        );
    }

    const restoredSql = restore(transpiled.sql[0]);
    const whereMatch = restoredSql.match(/WHERE\s+([\s\S]+)$/i);
    if (!whereMatch) {
        throw new Error(
            `Failed to extract sql_filter WHERE clause from transpiled SQL: ${restoredSql}`,
        );
    }

    return whereMatch[1].trim();
};

const getPreAggregateTablesWithSourceSqlFilters = ({
    sourceExplore,
    preAggExplore,
}: {
    sourceExplore: Explore;
    preAggExplore: Explore;
}): Explore['tables'] =>
    Object.fromEntries(
        Object.entries(preAggExplore.tables).map(([tableName, table]) => {
            const sourceTable = sourceExplore.tables[tableName];
            const rawSqlFilter =
                sourceTable?.uncompiledSqlWhere ??
                sourceTable?.sqlWhere ??
                table.uncompiledSqlWhere ??
                table.sqlWhere;

            return [
                tableName,
                {
                    ...table,
                    ...(rawSqlFilter
                        ? { uncompiledSqlWhere: rawSqlFilter }
                        : {}),
                },
            ];
        }),
    );

export const rebuildAndTranspilePreAggregateSqlFilters = async ({
    sourceExplore,
    preAggExplore,
    warehouseSqlBuilder,
}: {
    sourceExplore: Explore;
    preAggExplore: Explore;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): Promise<Explore['tables']> => {
    const rebuiltTables = getPreAggregateTablesWithSourceSqlFilters({
        sourceExplore,
        preAggExplore,
    });
    const columnReplacementMaps = getColumnReplacementMaps({
        sourceExplore,
        preAggExplore,
    });

    return Object.fromEntries(
        await Promise.all(
            Object.entries(rebuiltTables).map(async ([tableName, table]) => {
                const rawSqlFilter = table.uncompiledSqlWhere ?? table.sqlWhere;
                if (!rawSqlFilter) {
                    return [tableName, table] as const;
                }

                const compiledSqlWhere =
                    compileSqlFilterAgainstPreAggregateExplore({
                        sql: rawSqlFilter,
                        tableName,
                        preAggExplore,
                        warehouseSqlBuilder,
                    });
                const transpiledSqlWhere = await transpileSqlFilterToDuckDb({
                    sql: compiledSqlWhere,
                    sourceAdapter: sourceExplore.targetDatabase,
                });
                const rewrittenSqlWhere = await rewriteRawColumnReferences({
                    sql: transpiledSqlWhere,
                    currentTableName: tableName,
                    columnReplacementMaps,
                });

                return [
                    tableName,
                    {
                        ...table,
                        sqlWhere: rewrittenSqlWhere,
                    },
                ] as const;
            }),
        ),
    );
};

export const getSqlFilterRebuildError = (error: unknown): string =>
    `Failed to rebuild pre-aggregate sql_filter: ${getErrorMessage(error)}`;
