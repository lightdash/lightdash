import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    findAccessLoss,
    getErrorMessage,
    getItemId,
    isExploreError,
    JoinRelationship,
    MetricType,
    parseModelDocument,
    QueryExecutionContext,
    setModelJoinRelationships,
    type Account,
    type DimensionType,
    type Explore,
    type ExploreError,
    type MetricQuery,
    type SessionUser,
    type TablePartitioning,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { isEqual } from 'es-toolkit/compat';
import { createHash } from 'node:crypto';
import { fromSession } from '../../../auth/account';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type WarehouseSqlBuilderSettings } from '../../../services/ProjectService/warehouseSqlBuilderSettings';
import { toModelPath, withWrites } from './draftFold';
import { findChangedFields, findColumnError } from './draftLint';
import {
    findCatalogTable,
    getRowCountSql,
    parseTableReference,
    type CatalogTable,
} from './tableSize';

export type DraftCheckerProjectService = Pick<
    ProjectService,
    | 'getWarehouseSqlBuilderSettings'
    | 'runSqlQuery'
    | 'getWarehouseTables'
    | 'describeWarehouseTable'
> & {
    compileQuery: (args: {
        account: Account;
        projectUuid: string;
        explore: Explore;
        usePreAggregateCache: boolean;
        body: MetricQuery;
    }) => Promise<{ query: string; compilationErrors?: string[] }>;
};

type Compiled = { explores: (Explore | ExploreError)[]; quote: string };

export type DraftCheck = {
    /** Why each model that failed a check was left out. */
    rejected: Map<string, string>;
    /** What passed, with measured join relationships written in; null content removes the model. */
    writes: Map<string, string | null>;
    /** The live models with `writes` on top, compiled; null when nothing passed. */
    explores: (Explore | ExploreError)[] | null;
    /** What a model that passed should still be checked for by a person. */
    notes: Map<string, string[]>;
};

/** How unique a key is, as far as the rows that were read say. */
type KeyRead = {
    duplicates: number;
    /** False when the table has more rows than were read, so no duplicates is an estimate. */
    isWholeTable: boolean;
};

/** A key that was read, or why its table was left unread. */
type KeyCheck = KeyRead | { unread: string };

/** What the warehouse catalog says about the table a model reads. */
type TableFacts = {
    table: CatalogTable;
    /** Column types by lower-cased name. */
    columns: Map<string, DimensionType>;
    partitioning: TablePartitioning | null;
};

// Computed over the result set, so they cannot be selected on their own.
const POST_CALCULATION_METRICS = new Set<MetricType>([
    MetricType.PERCENT_OF_PREVIOUS,
    MetricType.PERCENT_OF_TOTAL,
    MetricType.RUNNING_TOTAL,
]);

// ponytail: a few whole compiles kept per process; shrink or add a TTL if large projects weigh on memory.
const MAX_KEPT_COMPILES = 4;

// A dimension that reads a column as it is, so the column's type is its type.
const PLAIN_COLUMN = /^\s*\$\{TABLE\}\.\w+\s*$/;

// ponytail: a fixed cap on the rows a key check reads; make it a setting if admins need to tune cost.
const MAX_KEY_CHECK_ROWS = 1_000_000;
const KEY_CHECK_TTL_MS = 10 * 60 * 1000;
const MAX_KEPT_KEY_CHECKS = 200;

const SIMPLE_JOIN = /^\s*\$\{(\w+)\.(\w+)\}\s*=\s*\$\{(\w+)\.(\w+)\}\s*$/;

const toRelationship = (
    localIsUnique: boolean,
    otherIsUnique: boolean,
): JoinRelationship => {
    if (localIsUnique && otherIsUnique) return JoinRelationship.ONE_TO_ONE;
    return localIsUnique
        ? JoinRelationship.ONE_TO_MANY
        : JoinRelationship.MANY_TO_ONE;
};

const isCompiled = (explore: Explore | ExploreError): explore is Explore =>
    !isExploreError(explore);

/** Whether an explore is built on any of these models, as its base or through a join, aliased or not. */
export const usesAnyModel = (
    explore: Explore,
    models: ReadonlyMap<string, unknown>,
): boolean =>
    Object.values(explore.tables).some(({ name, originalName }) =>
        models.has(originalName ?? name),
    );

const describeErrors = (errored: ExploreError[]): string =>
    errored
        .map(
            ({ name, errors }) =>
                `${name}: ${errors.map(({ message }) => message).join('; ')}`,
        )
        .join('. ');

const compileDocuments = async (
    settings: WarehouseSqlBuilderSettings,
    documents: Map<string, string>,
): Promise<Compiled> => {
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        settings.type,
        settings.startOfWeek,
    );
    const explores = await compileLightdashModels({
        models: [...documents].map(([name, content]) =>
            parseModelDocument(content, toModelPath(name)),
        ),
        warehouseSqlBuilder,
        lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    });
    return { explores, quote: warehouseSqlBuilder.getFieldQuoteChar() };
};

/** Checks drafted models against the compiler, the query builder and the warehouse before they may go live. */
export class DraftChecker {
    private readonly projectService: DraftCheckerProjectService;

    private readonly compiles = new Map<string, Promise<Compiled>>();

    private readonly keyChecks = new Map<
        string,
        { at: number; check: Promise<KeyCheck> }
    >();

    private readonly tableFacts = new Map<
        string,
        { at: number; facts: Promise<TableFacts | null> }
    >();

    constructor(projectService: DraftCheckerProjectService) {
        this.projectService = projectService;
    }

    /** Compiles every given model document into explores, in the project's warehouse dialect; the same documents compile once. */
    async compile(
        projectUuid: string,
        documents: Map<string, string>,
    ): Promise<Compiled> {
        const settings =
            await this.projectService.getWarehouseSqlBuilderSettings(
                projectUuid,
                { kind: 'original' },
            );
        const key = createHash('sha256')
            .update(
                JSON.stringify([
                    settings.type,
                    settings.startOfWeek,
                    ...documents,
                ]),
            )
            .digest('hex');
        const kept = this.compiles.get(key);
        const compiled = kept ?? compileDocuments(settings, documents);
        // Set again so the entry counts as the most recently used.
        this.compiles.delete(key);
        this.compiles.set(key, compiled);
        if (this.compiles.size > MAX_KEPT_COMPILES) {
            const [oldest] = this.compiles.keys();
            this.compiles.delete(oldest);
        }
        try {
            // A copy, so no caller can change what the next one reads.
            return structuredClone(await compiled);
        } catch (error) {
            this.compiles.delete(key);
            throw error;
        }
    }

    /** Compiles the model's metrics through the query builder, grouped by its own and each joined model's fields. */
    private async findQueryError(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
    ): Promise<string | null> {
        const metrics = Object.values(
            explore.tables[explore.baseTable].metrics,
        ).map(getItemId);
        if (metrics.length === 0) return null;
        // A metric can compile alone and still fail once grouped by a joined model.
        const groupings = [
            explore.baseTable,
            ...explore.joinedTables.map(({ table }) => table),
        ]
            .map((table) => Object.values(explore.tables[table].dimensions)[0])
            .filter((dimension) => dimension !== undefined)
            .map((dimension) => [getItemId(dimension)]);
        try {
            const compiled = await Promise.all(
                groupings.map((dimensions) =>
                    this.projectService.compileQuery({
                        account: fromSession(user),
                        projectUuid,
                        explore,
                        usePreAggregateCache: false,
                        body: {
                            exploreName: explore.name,
                            dimensions,
                            metrics,
                            filters: {},
                            sorts: [],
                            limit: 1,
                            tableCalculations: [],
                        },
                    }),
                ),
            );
            const errors = compiled.flatMap(
                ({ compilationErrors }) => compilationErrors ?? [],
            );
            return errors.length > 0 ? errors.join('; ') : null;
        } catch (error) {
            return getErrorMessage(error);
        }
    }

    /** Why a model cannot be used: first by the query builder, then planned on the warehouse over no rows. */
    private async findModelError(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        quote: string,
        changedDimensions: Set<string>,
    ): Promise<string | null> {
        const queryError = await this.findQueryError(
            user,
            projectUuid,
            explore,
        );
        if (queryError) {
            return `This model does not work in a query: ${queryError}`;
        }
        return this.findWarehouseError(
            user,
            projectUuid,
            explore,
            quote,
            changedDimensions,
        );
    }

    /** Has the warehouse plan a model's dimensions, metrics and joins over no rows, so it scans nothing; returns why it cannot be used, if so. */
    private async findWarehouseError(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        quote: string,
        changedDimensions: Set<string>,
    ): Promise<string | null> {
        const base = explore.tables[explore.baseTable];
        const alias = (name: string) => `${quote}${name}${quote}`;
        const tables = [
            base,
            ...explore.joinedTables.map(({ table }) => explore.tables[table]),
        ];
        // A table that requires a partition filter refuses a query without a predicate on its partition column, even one that reads nothing.
        const partitionFilters = new Map(
            await Promise.all(
                tables.map(async ({ sqlTable }) => {
                    const facts = await this.findTableFacts(
                        user,
                        projectUuid,
                        sqlTable,
                    );
                    const column = facts?.partitioning?.requiresPartitionFilter
                        ? facts.partitioning.partitionColumn.field
                        : null;
                    return [
                        sqlTable,
                        column
                            ? ` AND no_rows.${column.startsWith('_PARTITION') ? column : alias(column)} IS NOT NULL`
                            : '',
                    ] as const;
                }),
            ),
        );
        // ponytail: misses errors only a real value raises, such as a bad cast; run one row if that matters.
        const noRows = (sqlTable: string) =>
            `(SELECT * FROM ${sqlTable} AS no_rows WHERE 1 = 0${partitionFilters.get(sqlTable) ?? ''})`;
        const from = [
            `${noRows(base.sqlTable)} AS ${alias(base.name)}`,
            ...explore.joinedTables.map(
                (join) =>
                    `LEFT JOIN ${noRows(explore.tables[join.table].sqlTable)} AS ${alias(join.table)} ON ${join.compiledSqlOn}`,
            ),
        ].join('\n');
        const select = (expressions: string[]) =>
            `SELECT ${expressions.map((sql, index) => `${sql} AS c${index}`).join(',\n')}\nFROM ${from}`;
        const resolved = ({ compiledSql }: { compiledSql: string }) =>
            !compiledSql.includes('${');
        const dimensions = Object.values(base.dimensions).filter(resolved);
        const metrics = Object.values(base.metrics)
            .filter(resolved)
            .filter(({ type }) => !POST_CALCULATION_METRICS.has(type))
            .map(({ compiledSql }) => compiledSql);
        try {
            if (dimensions.length > 0) {
                const { fields } = await this.projectService.runSqlQuery(
                    user,
                    projectUuid,
                    select(dimensions.map(({ compiledSql }) => compiledSql)),
                    { kind: 'original' },
                );
                // Some warehouses fold an unquoted alias to upper case.
                const columnTypes = new Map(
                    Object.entries(fields).map(([column, { type }]) => [
                        column.toLowerCase(),
                        type,
                    ]),
                );
                const mistyped = dimensions.flatMap((dimension, index) => {
                    const columnType = columnTypes.get(`c${index}`);
                    return changedDimensions.has(dimension.name) &&
                        PLAIN_COLUMN.test(dimension.sql) &&
                        columnType !== undefined &&
                        columnType !== dimension.type
                        ? [{ name: dimension.name, columnType }]
                        : [];
                });
                if (mistyped.length > 0) {
                    return `${mistyped.map(({ name, columnType }) => `${name} reads a ${columnType} column`).join(', ')}, but ${mistyped.length === 1 ? 'is' : 'are'} typed differently. Use the column's type, or cast in sql to change it.`;
                }
            }
            if (metrics.length > 0) {
                await this.projectService.runSqlQuery(
                    user,
                    projectUuid,
                    select(metrics),
                    { kind: 'original' },
                );
            }
            return null;
        } catch (error) {
            return `The warehouse rejected this model: ${getErrorMessage(error)}`;
        }
    }

    /** Whether these dimensions identify one row of a table, read from at most a capped number of rows and kept for a while so a retry or an apply does not read them again. */
    private async checkKey(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        tableName: string,
        dimensionNames: string[],
        quote: string,
    ): Promise<KeyCheck> {
        const table = explore.tables[tableName];
        const keys = dimensionNames.map(
            (name) => table.dimensions[name].compiledSql,
        );
        const memoKey = [projectUuid, table.sqlTable, ...keys].join('|');
        const kept = this.keyChecks.get(memoKey);
        if (kept && Date.now() - kept.at < KEY_CHECK_TTL_MS) return kept.check;
        const check = (async (): Promise<KeyCheck> => {
            const facts = await this.findTableFacts(
                user,
                projectUuid,
                table.sqlTable,
            );
            // Whoever required the filter does not want this table read whole.
            if (facts?.partitioning?.requiresPartitionFilter) {
                return {
                    unread: `${tableName} requires a partition filter, so it is not read for a check.`,
                };
            }
            const rowCount = facts
                ? await this.findRowCount(user, projectUuid, facts.table)
                : null;
            if (rowCount !== null && rowCount > MAX_KEY_CHECK_ROWS) {
                return {
                    unread: `${tableName} has about ${rowCount.toLocaleString('en-US')} rows, more than a check reads.`,
                };
            }
            return this.readKey(user, projectUuid, table.sqlTable, {
                alias: `${quote}${tableName}${quote}`,
                keys,
            });
        })();
        this.keyChecks.set(memoKey, { at: Date.now(), check });
        if (this.keyChecks.size > MAX_KEPT_KEY_CHECKS) {
            const [oldest] = this.keyChecks.keys();
            this.keyChecks.delete(oldest);
        }
        check.catch(() => this.keyChecks.delete(memoKey));
        return check;
    }

    /** The catalog's columns and partitioning for the table a model reads; null for a query, or a table the catalog cannot place. */
    private findTableFacts(
        user: SessionUser,
        projectUuid: string,
        sqlTable: string,
    ): Promise<TableFacts | null> {
        const memoKey = `${projectUuid}|${sqlTable}`;
        const kept = this.tableFacts.get(memoKey);
        if (kept && Date.now() - kept.at < KEY_CHECK_TTL_MS) return kept.facts;
        const facts = (async (): Promise<TableFacts | null> => {
            const reference = parseTableReference(sqlTable);
            if (!reference) return null;
            const table = findCatalogTable(
                await this.projectService.getWarehouseTables(user, projectUuid),
                reference,
            );
            if (!table) return null;
            const { fields, partitioning } =
                await this.projectService.describeWarehouseTable(
                    user,
                    projectUuid,
                    QueryExecutionContext.SQL_RUNNER,
                    {
                        tableName: table.table,
                        schemaName: table.schema,
                        databaseName: table.database,
                    },
                );
            return {
                table,
                columns: new Map(
                    Object.entries(fields).map(([column, type]) => [
                        column.toLowerCase(),
                        type,
                    ]),
                ),
                partitioning,
            };
        })().catch(() => null);
        this.tableFacts.set(memoKey, { at: Date.now(), facts });
        if (this.tableFacts.size > MAX_KEPT_KEY_CHECKS) {
            const [oldest] = this.tableFacts.keys();
            this.tableFacts.delete(oldest);
        }
        return facts;
    }

    /** A table's approximate row count from the warehouse's own metadata, which scans nothing; null when it is not known. */
    private async findRowCount(
        user: SessionUser,
        projectUuid: string,
        table: CatalogTable,
    ): Promise<number | null> {
        try {
            const settings =
                await this.projectService.getWarehouseSqlBuilderSettings(
                    projectUuid,
                    { kind: 'original' },
                );
            const builder = warehouseSqlBuilderFromType(
                settings.type,
                settings.startOfWeek,
            );
            const stringQuote = builder.getStringQuoteChar();
            const sql = getRowCountSql(
                settings.type,
                table,
                (value) =>
                    `${stringQuote}${builder.escapeString(value)}${stringQuote}`,
            );
            if (!sql) return null;
            const { rows } = await this.projectService.runSqlQuery(
                user,
                projectUuid,
                sql,
                { kind: 'original' },
            );
            const [value] = Object.values(rows[0] ?? {});
            const rowCount = Number(value);
            // Zero or less is what a warehouse reports for a view or a table it has no statistics for.
            return Number.isFinite(rowCount) && rowCount > 0 ? rowCount : null;
        } catch {
            return null;
        }
    }

    private async readKey(
        user: SessionUser,
        projectUuid: string,
        sqlTable: string,
        { alias, keys }: { alias: string; keys: string[] },
    ): Promise<KeyRead> {
        const aliases = keys.map((_key, index) => `k${index}`);
        return this.projectService
            .runSqlQuery(
                user,
                projectUuid,
                `SELECT COALESCE(SUM(CASE WHEN key_rows > 1 THEN 1 ELSE 0 END), 0) AS duplicate_keys, COALESCE(SUM(key_rows), 0) AS checked_rows FROM (
SELECT COUNT(*) AS key_rows FROM (
SELECT ${keys.map((key, index) => `${key} AS ${aliases[index]}`).join(', ')}
FROM ${sqlTable} AS ${alias}
WHERE ${keys.map((key) => `${key} IS NOT NULL`).join(' AND ')}
LIMIT ${MAX_KEY_CHECK_ROWS}
) AS read_rows
GROUP BY ${aliases.join(', ')}
) AS counted`,
                { kind: 'original' },
            )
            .then(({ rows }): KeyRead => {
                // Some warehouses fold an unquoted alias to upper case.
                const row = new Map(
                    Object.entries(rows[0] ?? {}).map(([column, value]) => [
                        column.toLowerCase(),
                        Number(value ?? 0),
                    ]),
                );
                return {
                    duplicates: row.get('duplicate_keys') ?? 0,
                    isWholeTable:
                        (row.get('checked_rows') ?? 0) < MAX_KEY_CHECK_ROWS,
                };
            });
    }

    /** Checks a model's new primary key on the warehouse, and measures what each new join does to row counts. */
    private async measureModel(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        contents: string,
        storedContents: string | null,
        quote: string,
    ): Promise<
        | { error: string }
        | { relationships: Map<string, JoinRelationship>; notes: string[] }
    > {
        const relationships = new Map<string, JoinRelationship>();
        const notes: string[] = [];
        const isEstimate = ({ duplicates, isWholeTable }: KeyRead) =>
            duplicates === 0 && !isWholeTable;
        const model = parseModelDocument(contents, toModelPath(explore.name));
        const stored =
            storedContents === null
                ? null
                : parseModelDocument(storedContents, toModelPath(explore.name));
        // The model already ran on the warehouse, so a key that goes unread is too large to read, or hit a budget, a timeout or a type that cannot be grouped: not a reason to refuse the model.
        const unread: string[] = [];
        const checkKey = async (
            table: string,
            dimensions: string[],
        ): Promise<KeyRead | null> => {
            try {
                const check = await this.checkKey(
                    user,
                    projectUuid,
                    explore,
                    table,
                    dimensions,
                    quote,
                );
                if (!('unread' in check)) return check;
                unread.push(check.unread);
            } catch (error) {
                unread.push(
                    `The warehouse said: ${getErrorMessage(error).slice(0, 200)}`,
                );
            }
            return null;
        };
        const whyUnread = () => (unread[0] ? ` ${unread[0]}` : '');
        const measureJoin = async ({
            alias,
            join,
            sql_on: sqlOn,
        }: {
            alias?: string;
            join: string;
            sql_on: string;
        }): Promise<{
            joined: string;
            relationship: JoinRelationship | null;
            error: string | null;
            isEstimate: boolean;
            isUnchecked: boolean;
            isAssumed: boolean;
        } | null> => {
            const on = SIMPLE_JOIN.exec(sqlOn);
            if (!on) return null;
            const [, leftTable, leftField, rightTable, rightField] = on;
            const joined = alias ?? join;
            const [local, other] =
                leftTable === joined
                    ? [
                          { table: rightTable, field: rightField },
                          { table: leftTable, field: leftField },
                      ]
                    : [
                          { table: leftTable, field: leftField },
                          { table: rightTable, field: rightField },
                      ];
            if (
                !explore.tables[local.table]?.dimensions[local.field] ||
                !explore.tables[other.table]?.dimensions[other.field]
            ) {
                return null;
            }
            const [localKey, otherKey] = await Promise.all([
                checkKey(local.table, [local.field]),
                checkKey(other.table, [other.field]),
            ]);
            // A joined table that is unique on its key cannot multiply this model's rows, whatever this model holds, so many-to-one is safe to assume without reading it.
            const isAssumed = !localKey && otherKey?.duplicates === 0;
            if (!otherKey || (!localKey && !isAssumed)) {
                return {
                    joined,
                    relationship: null,
                    error: null,
                    isEstimate: false,
                    isUnchecked: true,
                    isAssumed: false,
                };
            }
            const localIsUnique = localKey?.duplicates === 0;
            const otherIsUnique = otherKey.duplicates === 0;
            if (!localIsUnique && !otherIsUnique) {
                return {
                    joined,
                    relationship: null,
                    isEstimate: false,
                    isUnchecked: false,
                    isAssumed: false,
                    error: `The join to ${joined} is many-to-many on ${local.field} and ${other.field}, so it would multiply rows on both sides. Leave it out, or join through a table where one side is unique.`,
                };
            }
            if (
                localIsUnique &&
                !otherIsUnique &&
                !explore.tables[local.table].primaryKey
            ) {
                return {
                    joined,
                    relationship: null,
                    isEstimate: false,
                    isUnchecked: false,
                    isAssumed: false,
                    error: `The join to ${joined} is one-to-many, so it multiplies rows of ${local.table}, and its metrics are only protected from that with a primary_key. Set primary_key on ${local.table}, or define this from ${joined} instead.`,
                };
            }
            return {
                joined,
                relationship: toRelationship(localIsUnique, otherIsUnique),
                error: null,
                // A duplicate that was found is certain; none found in part of a table is not.
                isEstimate:
                    (localKey !== null && isEstimate(localKey)) ||
                    isEstimate(otherKey),
                isUnchecked: false,
                isAssumed,
            };
        };
        try {
            const { primaryKey } = explore.tables[explore.baseTable];
            if (
                primaryKey &&
                !isEqual(stored?.primary_key, model.primary_key)
            ) {
                const key = await checkKey(explore.baseTable, primaryKey);
                if (!key) {
                    notes.push(
                        `primary_key ${primaryKey.join(', ')} was not checked on the warehouse, so confirm it identifies one row.${whyUnread()}`,
                    );
                } else if (key.duplicates > 0) {
                    return {
                        error: `primary_key ${primaryKey.join(', ')} is not unique, so it cannot identify a row. Remove it or name the column that does.`,
                    };
                }
                if (key && isEstimate(key)) {
                    notes.push(
                        `primary_key ${primaryKey.join(', ')} was checked on the first ${MAX_KEY_CHECK_ROWS.toLocaleString('en-US')} rows only, so confirm it identifies one row.`,
                    );
                }
            }
            if (
                stored?.primary_key &&
                !model.primary_key &&
                (model.joins ?? []).some(
                    ({ relationship }) =>
                        relationship === JoinRelationship.ONE_TO_MANY,
                )
            ) {
                return {
                    error: `A one-to-many join on ${explore.name} multiplies its rows, and its metrics are only protected from that with a primary_key. Keep primary_key, or remove the join first.`,
                };
            }
            const measured = await Promise.all(
                (model.joins ?? [])
                    .filter(({ relationship }) => !relationship)
                    .map((join) => measureJoin(join)),
            );
            const failed = measured.find((join) => join?.error);
            if (failed?.error) return { error: failed.error };
            measured.forEach((join) => {
                if (join?.isUnchecked) {
                    notes.push(
                        `The join to ${join.joined} was not measured on the warehouse, so its relationship is not set. Set it yourself before applying.${whyUnread()}`,
                    );
                }
                if (!join?.relationship) return;
                relationships.set(join.joined, join.relationship);
                if (join.isAssumed) {
                    notes.push(
                        `The join to ${join.joined} is set as ${join.relationship} because ${join.joined} is unique on its key; this model's side was not read.${whyUnread()}`,
                    );
                }
                if (join.isEstimate) {
                    notes.push(
                        `The join to ${join.joined} was measured on the first ${MAX_KEY_CHECK_ROWS.toLocaleString('en-US')} rows only, so its ${join.relationship} relationship is an estimate. Confirm it before applying.`,
                    );
                }
            });
            return { relationships, notes };
        } catch (error) {
            return {
                error: `The warehouse could not check this model's keys: ${getErrorMessage(error)}`,
            };
        }
    }

    /** The explores that fail to compile and did not already fail on what is live. */
    async findNewlyBroken(
        projectUuid: string,
        live: Map<string, string>,
        explores: (Explore | ExploreError)[],
    ): Promise<ExploreError[]> {
        const errored = explores.filter(isExploreError);
        if (errored.length === 0) return [];
        const brokenAlready = new Set(
            (await this.compile(projectUuid, live)).explores
                .filter(isExploreError)
                .map(({ name }) => name),
        );
        return errored.filter(({ name }) => !brokenAlready.has(name));
    }

    /** Drops every write that fails a check, and whatever depended on it, until what is left works together. */
    async check(
        user: SessionUser,
        projectUuid: string,
        live: Map<string, string>,
        proposed: Map<string, string | null>,
    ): Promise<DraftCheck> {
        const writes = new Map(proposed);
        const rejected = new Map<string, string>();
        const notes = new Map<string, string[]>();
        const reject = (model: string, error: string) => {
            writes.delete(model);
            rejected.set(model, error);
        };
        const rejectAll = (error: string) =>
            [...writes.keys()].forEach((model) => reject(model, error));

        // A model that fails to compile is dropped, then the rest compiles again because another may have joined it.
        const compile = async (): Promise<Compiled | null> => {
            if (writes.size === 0) return null;
            const compiled = await this.compile(
                projectUuid,
                withWrites(live, writes),
            );
            const own = compiled.explores
                .filter(isExploreError)
                .filter(({ name }) => writes.has(name));
            if (own.length > 0) {
                own.forEach((explore) =>
                    reject(
                        explore.name,
                        explore.errors.map(({ message }) => message).join('; '),
                    ),
                );
                return compile();
            }
            const newlyBroken = await this.findNewlyBroken(
                projectUuid,
                live,
                compiled.explores,
            );
            if (newlyBroken.length === 0) return compiled;
            rejectAll(`This would break ${describeErrors(newlyBroken)}`);
            return null;
        };

        const changed = new Map(
            [...writes].flatMap(([name, contents]) =>
                contents === null
                    ? []
                    : [
                          [
                              name,
                              findChangedFields(
                                  name,
                                  contents,
                                  live.get(name) ?? null,
                              ),
                          ] as const,
                      ],
            ),
        );
        changed.forEach(({ metricError }, name) => {
            if (metricError) reject(name, metricError);
        });
        // The catalog knows a table's columns, so a wrong name or type is caught before any query, in the same words on every warehouse.
        const inCatalog = new Set<string>();
        await Promise.all(
            [...writes].map(async ([name, contents]) => {
                if (contents === null) return;
                const facts = await this.findTableFacts(
                    user,
                    projectUuid,
                    parseModelDocument(contents, toModelPath(name)).sql_from,
                );
                if (!facts) return;
                inCatalog.add(name);
                const error = findColumnError(
                    name,
                    contents,
                    facts.columns,
                    changed.get(name)?.dimensions ?? new Set(),
                );
                if (error) reject(name, error);
            }),
        );
        [...writes].forEach(([name, contents]) => {
            const stored = live.get(name);
            if (contents === null || stored === undefined) return;
            const lost = findAccessLoss(stored, contents);
            if (lost.length > 0) {
                reject(
                    name,
                    `This would change who can see ${lost.join(', ')}, which cannot be changed here.`,
                );
            }
        });

        const afterCompile = await compile();
        if (!afterCompile) {
            return { rejected, writes, explores: null, notes };
        }

        // Redefining a model can break those that join it.
        const usable = await Promise.all(
            afterCompile.explores
                .filter(isCompiled)
                .filter((explore) => usesAnyModel(explore, writes))
                .map(async (explore) => ({
                    name: explore.name,
                    error: await this.findModelError(
                        user,
                        projectUuid,
                        explore,
                        afterCompile.quote,
                        // A model the catalog already vouched for needs no second opinion on its types.
                        inCatalog.has(explore.name)
                            ? new Set()
                            : (changed.get(explore.name)?.dimensions ??
                                  new Set()),
                    ),
                })),
        );
        const unusable = usable.flatMap(({ name, error }) =>
            error === null ? [] : [{ name, error }],
        );
        unusable.forEach(({ name, error }) => {
            if (writes.has(name)) reject(name, error);
            else rejectAll(`This would break ${name}: ${error}`);
        });
        const afterUse = unusable.length > 0 ? await compile() : afterCompile;
        if (!afterUse) return { rejected, writes, explores: null, notes };

        const measured = await Promise.all(
            afterUse.explores.filter(isCompiled).flatMap((explore) => {
                const contents = writes.get(explore.name);
                // A compiled explore is never a removal, so only written models are measured.
                if (contents === undefined || contents === null) return [];
                return [
                    this.measureModel(
                        user,
                        projectUuid,
                        explore,
                        contents,
                        live.get(explore.name) ?? null,
                        afterUse.quote,
                    ).then((measure) => ({
                        name: explore.name,
                        contents,
                        measure,
                    })),
                ];
            }),
        );
        measured.forEach(({ name, contents, measure }) => {
            if ('error' in measure) {
                reject(name, measure.error);
                return;
            }
            if (measure.notes.length > 0) notes.set(name, measure.notes);
            if (measure.relationships.size > 0) {
                writes.set(
                    name,
                    setModelJoinRelationships({
                        contents,
                        filename: toModelPath(name),
                        relationships: measure.relationships,
                    }),
                );
            }
        });
        const settled = await compile();
        return {
            rejected,
            writes,
            explores: settled?.explores ?? null,
            notes,
        };
    }
}
