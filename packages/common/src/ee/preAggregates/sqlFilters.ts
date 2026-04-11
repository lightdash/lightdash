import {
    Dialect,
    init,
    isInitialized,
    tokenize,
    transpile,
} from '@polyglot-sql/sdk';
import { parseAllReferences } from '../../compiler/exploreCompiler';
import { SupportedDbtAdapter } from '../../types/dbt';
import { type Explore } from '../../types/explore';
import { type PreAggregateDef } from '../../types/preAggregate';
import assertUnreachable from '../../utils/assertUnreachable';
import { getItemId } from '../../utils/item';
import {
    getDimensionReferences,
    getSimpleSqlColumnName,
    type PreAggregateDimensionReferenceLookup,
} from './references';

export type PreAggregateSqlFilterDependency = {
    tableName: string;
    reference: string;
    fieldId: string;
};

export type PreAggregateSqlFilterCompatibilityResult =
    | {
          supported: true;
          dependencies: PreAggregateSqlFilterDependency[];
      }
    | {
          supported: false;
          dependency: PreAggregateSqlFilterDependency;
          dependencies: PreAggregateSqlFilterDependency[];
      };

const SQL_FILTER_PLACEHOLDER_PATTERN = /\$\{[^}]+\}/g;
const LIQUID_TAG_PATTERN = /\{%(?:[\s\S]*?)%\}/g;

type SqlToken = {
    text?: string;
    token_type?: string;
    tokenType?: string;
};

const getReferencedTable = (
    refTable: string,
    tables: Explore['tables'],
): Explore['tables'][string] | undefined =>
    tables[refTable] ??
    Object.values(tables).find(
        (table) => table.name === refTable || table.originalName === refTable,
    );

const isNonEmptyString = (value: string | undefined): value is string =>
    !!value;

const getTableAliases = (table: Explore['tables'][string]): Set<string> =>
    new Set([table.name, table.originalName].filter(isNonEmptyString));

const getDialect = (adapter: SupportedDbtAdapter): Dialect => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return Dialect.PostgreSQL;
        case SupportedDbtAdapter.BIGQUERY:
            return Dialect.BigQuery;
        case SupportedDbtAdapter.SNOWFLAKE:
            return Dialect.Snowflake;
        case SupportedDbtAdapter.DATABRICKS:
            return Dialect.Databricks;
        case SupportedDbtAdapter.REDSHIFT:
            return Dialect.Redshift;
        case SupportedDbtAdapter.TRINO:
            return Dialect.Trino;
        case SupportedDbtAdapter.ATHENA:
            return Dialect.Athena;
        case SupportedDbtAdapter.DUCKDB:
            return Dialect.DuckDB;
        case SupportedDbtAdapter.CLICKHOUSE:
            return Dialect.ClickHouse;
        default:
            return assertUnreachable(
                adapter,
                `Unsupported dbt adapter "${adapter}" for sql filter analysis`,
            );
    }
};

const ensurePolyglotInitialized = async (): Promise<void> => {
    if (!isInitialized()) {
        await init();
    }
};

const getSqlToken = (token: unknown): SqlToken | undefined =>
    typeof token === 'object' && token !== null
        ? (token as SqlToken)
        : undefined;

const getTokenType = (token: unknown): string | undefined =>
    getSqlToken(token)?.token_type ?? getSqlToken(token)?.tokenType;

const isIdentifierToken = (token: unknown): boolean => {
    const tokenType = getTokenType(token);
    return tokenType === 'VAR' || tokenType === 'QUOTED_IDENTIFIER';
};

const isDotToken = (token: unknown): boolean =>
    getTokenType(token) === 'DOT' || getSqlToken(token)?.text === '.';

const isOpenParenToken = (token: unknown): boolean =>
    getTokenType(token) === 'L_PAREN' || getSqlToken(token)?.text === '(';

const normalizeIdentifier = (value: string): string => {
    const normalizedValue =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith('`') && value.endsWith('`'))
            ? value.slice(1, -1)
            : value;

    return normalizedValue.toLowerCase();
};

const normalizeSqlFilterForTokenizing = ({
    sql,
    currentTableName,
}: {
    sql: string;
    currentTableName: string;
}): string =>
    sql
        .replace(LIQUID_TAG_PATTERN, ' ')
        .replace(SQL_FILTER_PLACEHOLDER_PATTERN, (match) =>
            match === '${TABLE}' ? currentTableName : 'NULL',
        );

const getDimensionsBySimpleSqlColumn = (
    explore: Explore,
): Map<string, Map<string, PreAggregateDimensionReferenceLookup[]>> =>
    Object.values(explore.tables).reduce<
        Map<string, Map<string, PreAggregateDimensionReferenceLookup[]>>
    >((tablesLookup, table) => {
        const tableLookup =
            tablesLookup.get(table.name) ??
            new Map<string, PreAggregateDimensionReferenceLookup[]>();
        Object.values(table.dimensions).forEach((dimension) => {
            const columnName = getSimpleSqlColumnName(dimension);
            if (!columnName) {
                return;
            }

            const lookup = {
                fieldId: getItemId(dimension),
                dimension,
            };

            const existingLookups: PreAggregateDimensionReferenceLookup[] =
                tableLookup.get(columnName) ?? [];
            tableLookup.set(columnName, [...existingLookups, lookup]);
            tablesLookup.set(table.name, tableLookup);
        });

        return tablesLookup;
    }, new Map());

const getRawSqlColumnReferences = async ({
    sql,
    currentTableName,
    sourceAdapter,
}: {
    sql: string;
    currentTableName: string;
    sourceAdapter: SupportedDbtAdapter;
}): Promise<{
    qualified: Set<string>;
    unqualified: Set<string>;
}> => {
    await ensurePolyglotInitialized();

    const wrappedSql = `SELECT 1 WHERE ${normalizeSqlFilterForTokenizing({
        sql,
        currentTableName,
    })}`;
    const sourceDialect = getDialect(sourceAdapter);
    const transpiled = transpile(wrappedSql, sourceDialect, Dialect.DuckDB);
    const sqlToTokenize =
        transpiled.success && transpiled.sql && transpiled.sql.length > 0
            ? transpiled.sql[0]
            : wrappedSql;
    const tokenDialect =
        transpiled.success && transpiled.sql && transpiled.sql.length > 0
            ? Dialect.DuckDB
            : sourceDialect;
    const tokenResult = tokenize(sqlToTokenize, tokenDialect);
    const qualified = new Set<string>();
    const unqualified = new Set<string>();

    if (!tokenResult.success || !tokenResult.tokens) {
        return { qualified, unqualified };
    }

    const { tokens } = tokenResult;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const previousToken = tokens[index - 1];
        const nextToken = tokens[index + 1];
        const columnToken = tokens[index + 2];
        const tokenText = getSqlToken(token)?.text;
        const columnTokenText = getSqlToken(columnToken)?.text;

        if (
            isIdentifierToken(token) &&
            isDotToken(nextToken) &&
            isIdentifierToken(columnToken) &&
            tokenText &&
            columnTokenText
        ) {
            qualified.add(
                `${normalizeIdentifier(tokenText)}.${normalizeIdentifier(
                    columnTokenText,
                )}`,
            );
            index += 2;
        } else if (
            isIdentifierToken(token) &&
            tokenText &&
            !isDotToken(previousToken) &&
            !isDotToken(nextToken) &&
            !isOpenParenToken(nextToken)
        ) {
            unqualified.add(normalizeIdentifier(tokenText));
        }
    }

    return { qualified, unqualified };
};

const matchesQualifiedColumnReference = ({
    qualifiedReferences,
    tableAliases,
    columnName,
}: {
    qualifiedReferences: Set<string>;
    tableAliases: string[];
    columnName: string;
}): boolean =>
    tableAliases.some((alias) =>
        qualifiedReferences.has(
            `${alias.toLowerCase()}.${columnName.toLowerCase()}`,
        ),
    );

const matchesCurrentTableColumnReference = ({
    qualifiedReferences,
    unqualifiedReferences,
    tableAliases,
    columnName,
}: {
    qualifiedReferences: Set<string>;
    unqualifiedReferences: Set<string>;
    tableAliases: string[];
    columnName: string;
}): boolean =>
    unqualifiedReferences.has(columnName.toLowerCase()) ||
    matchesQualifiedColumnReference({
        qualifiedReferences,
        tableAliases,
        columnName,
    });

const addDependency = ({
    dependencies,
    seenFieldIds,
    tableName,
    reference,
    lookup,
}: {
    dependencies: PreAggregateSqlFilterDependency[];
    seenFieldIds: Set<string>;
    tableName: string;
    reference: string;
    lookup: PreAggregateDimensionReferenceLookup;
}) => {
    if (seenFieldIds.has(lookup.fieldId)) {
        return;
    }

    seenFieldIds.add(lookup.fieldId);
    dependencies.push({
        tableName,
        reference,
        fieldId: lookup.fieldId,
    });
};

export const getSqlFilterDependencies = async (
    explore: Explore,
): Promise<PreAggregateSqlFilterDependency[]> => {
    const dependencies: PreAggregateSqlFilterDependency[] = [];
    const seenFieldIds = new Set<string>();
    const simpleSqlColumns = getDimensionsBySimpleSqlColumn(explore);

    const sqlFiltersByTable = await Promise.all(
        Object.values(explore.tables).map(async (table) => {
            const rawSqlFilter = table.uncompiledSqlWhere ?? table.sqlWhere;
            return {
                table,
                rawSqlFilter,
                rawSqlColumnReferences: rawSqlFilter
                    ? await getRawSqlColumnReferences({
                          sql: rawSqlFilter,
                          currentTableName: table.name,
                          sourceAdapter: explore.targetDatabase,
                      })
                    : null,
            };
        }),
    );

    sqlFiltersByTable.forEach(
        ({ table, rawSqlFilter, rawSqlColumnReferences }) => {
            if (rawSqlFilter && rawSqlColumnReferences) {
                parseAllReferences(rawSqlFilter, table.name)
                    .filter((reference) => reference.refName !== 'TABLE')
                    .forEach((reference) => {
                        const referencedTable = getReferencedTable(
                            reference.refTable,
                            explore.tables,
                        );
                        const referencedDimension =
                            referencedTable?.dimensions[reference.refName];

                        if (referencedTable && referencedDimension) {
                            addDependency({
                                dependencies,
                                seenFieldIds,
                                tableName: referencedTable.name,
                                reference:
                                    reference.refTable === table.name
                                        ? `\${${reference.refName}}`
                                        : `\${${reference.refTable}.${reference.refName}}`,
                                lookup: {
                                    fieldId: getItemId(referencedDimension),
                                    dimension: referencedDimension,
                                },
                            });
                        }
                    });

                Object.values(explore.tables).forEach((targetTable) => {
                    const tableAliases = Array.from(
                        getTableAliases(targetTable),
                    );
                    const columnLookups =
                        simpleSqlColumns.get(targetTable.name) ??
                        new Map<
                            string,
                            PreAggregateDimensionReferenceLookup[]
                        >();

                    columnLookups.forEach((lookups, columnName) => {
                        const hasReference =
                            targetTable.name === table.name
                                ? matchesCurrentTableColumnReference({
                                      qualifiedReferences:
                                          rawSqlColumnReferences.qualified,
                                      unqualifiedReferences:
                                          rawSqlColumnReferences.unqualified,
                                      tableAliases,
                                      columnName,
                                  })
                                : matchesQualifiedColumnReference({
                                      qualifiedReferences:
                                          rawSqlColumnReferences.qualified,
                                      tableAliases,
                                      columnName,
                                  });

                        if (!hasReference) {
                            return;
                        }

                        lookups.forEach((lookup) =>
                            addDependency({
                                dependencies,
                                seenFieldIds,
                                tableName: targetTable.name,
                                reference: columnName,
                                lookup,
                            }),
                        );
                    });
                });
            }
        },
    );

    return dependencies;
};

export const getPreAggregateSqlFilterCompatibility = async ({
    explore,
    preAggregateDef,
}: {
    explore: Explore;
    preAggregateDef: PreAggregateDef;
}): Promise<PreAggregateSqlFilterCompatibilityResult> => {
    const effectiveDimensionReferences = new Set(preAggregateDef.dimensions);
    const dimensionsByFieldId = Object.values(explore.tables).reduce<
        Map<string, Explore['tables'][string]['dimensions'][string]>
    >((acc, table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            acc.set(getItemId(dimension), dimension);
        });
        return acc;
    }, new Map());

    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        !effectiveDimensionReferences.has(preAggregateDef.timeDimension)
    ) {
        effectiveDimensionReferences.add(preAggregateDef.timeDimension);
    }

    const dependencies = await getSqlFilterDependencies(explore);
    const firstUnsupportedDependency = dependencies.find((dependency) => {
        const dimension = dimensionsByFieldId.get(dependency.fieldId);

        if (!dimension) {
            return true;
        }

        return !getDimensionReferences({
            dimension,
            baseTable: explore.baseTable,
        }).some((reference) => effectiveDimensionReferences.has(reference));
    });

    if (firstUnsupportedDependency) {
        return {
            supported: false,
            dependency: firstUnsupportedDependency,
            dependencies,
        };
    }

    return {
        supported: true,
        dependencies,
    };
};

export const formatPreAggregateSqlFilterCompatibilityError = ({
    preAggregateName,
    compatibility,
}: {
    preAggregateName: string;
    compatibility: Extract<
        PreAggregateSqlFilterCompatibilityResult,
        { supported: false }
    >;
}): string =>
    `Pre-aggregate "${preAggregateName}" cannot support sql_filter because table "${compatibility.dependency.tableName}" requires "${compatibility.dependency.reference}" (${compatibility.dependency.fieldId}), which is not materialized by the pre-aggregate`;
