import {
    generateSlug,
    getDimensions,
    getItemId,
    getMetrics,
    QueryExecutionContext,
    type Account,
    type ResultRow,
} from '@lightdash/common';
import { parse } from 'pgsql-ast-parser';
import { fromApiKey } from '../auth/account/account';
import Logger from '../logging/logger';
import type { ServiceRepository } from '../services/ServiceRepository';
import { tryHandleInformationSchema } from './informationSchema';
import {
    PgWireServerError,
    type PgWireHandlers,
    type PgWireQueryResult,
    type PgWireResultField,
} from './PostgresWireServer';
import { compileSqlToMetricQuery, SqlCompileError } from './sqlToMetricQuery';
import { type PgWireColumn, type PgWireField, type PgWireTable } from './types';

export type LightdashPgWireSession = {
    account: Account;
    projectUuid: string;
    catalog: PgWireTable[];
};

const VERSION_STRING =
    'PostgreSQL 16.3 (Lightdash semantic layer, wire protocol)';

const TEXT_OID = 25;
const BOOL_OID = 16;
const INT8_OID = 20;
const FLOAT8_OID = 701;
const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;

/** DimensionType / MetricType value -> Postgres type OID */
const TYPE_OIDS: Record<string, number> = {
    string: TEXT_OID,
    number: FLOAT8_OID,
    boolean: BOOL_OID,
    date: DATE_OID,
    timestamp: TIMESTAMP_OID,
    count: INT8_OID,
    count_distinct: INT8_OID,
    sum: FLOAT8_OID,
    average: FLOAT8_OID,
    median: FLOAT8_OID,
    percentile: FLOAT8_OID,
    min: FLOAT8_OID,
    max: FLOAT8_OID,
};

const oidForColumn = (column: PgWireColumn): number =>
    (column.type && TYPE_OIDS[column.type]) || TEXT_OID;

const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Serialize a raw result value to Postgres text format */
const toTextValue = (raw: unknown, type: string | null): string | null => {
    if (raw === null || raw === undefined) return null;
    if (raw instanceof Date) {
        if (type === 'date') return raw.toISOString().slice(0, 10);
        return raw.toISOString().replace('T', ' ').replace('Z', '+00');
    }
    if (typeof raw === 'boolean') return raw ? 't' : 'f';
    if (typeof raw === 'string' && ISO_DATETIME_PATTERN.test(raw)) {
        if (type === 'date') return raw.slice(0, 10);
        if (type === 'timestamp')
            return raw.replace('T', ' ').replace('Z', '+00');
    }
    if (typeof raw === 'object') return JSON.stringify(raw);
    return String(raw);
};

const compileErrorToServerError = (e: SqlCompileError): PgWireServerError => {
    let code = '42601'; // syntax_error
    if (e.message.includes('does not exist in table')) code = '42703'; // undefined_column
    if (e.message.includes('does not exist') && e.message.includes('Table'))
        code = '42P01'; // undefined_table
    return new PgWireServerError(e.message, code, e.hint);
};

/** SHOW <param> responses for common client compatibility probes */
const SHOW_PARAMETERS: Record<string, string> = {
    server_version: '16.3 (Lightdash)',
    server_encoding: 'UTF8',
    client_encoding: 'UTF8',
    transaction_isolation: 'read committed',
    standard_conforming_strings: 'on',
    timezone: 'UTC',
    datestyle: 'ISO, MDY',
    search_path: 'public',
};

/**
 * Handle transaction/session statements that BI tools and drivers send but
 * that have no meaning against the semantic layer. Returns null when the
 * statement should be compiled as a real query.
 */
const tryHandleSessionStatement = (sql: string): PgWireQueryResult | null => {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() ?? '';
    switch (firstWord) {
        case 'BEGIN':
        case 'START':
            return { type: 'command', commandTag: 'BEGIN' };
        case 'COMMIT':
        case 'END':
            return { type: 'command', commandTag: 'COMMIT' };
        case 'ROLLBACK':
        case 'ABORT':
            return { type: 'command', commandTag: 'ROLLBACK' };
        case 'SET':
            return { type: 'command', commandTag: 'SET' };
        case 'RESET':
            return { type: 'command', commandTag: 'RESET' };
        case 'DISCARD':
            return { type: 'command', commandTag: 'DISCARD ALL' };
        case 'DEALLOCATE':
            return { type: 'command', commandTag: 'DEALLOCATE' };
        case 'SHOW': {
            const param = trimmed.split(/\s+/)[1]?.toLowerCase() ?? '';
            const value = SHOW_PARAMETERS[param];
            if (value === undefined) {
                throw new PgWireServerError(
                    `unrecognized configuration parameter "${param}"`,
                    '42704',
                );
            }
            return {
                type: 'rows',
                fields: [{ name: param, oid: TEXT_OID }],
                rows: [[value]],
                commandTag: 'SHOW',
            };
        }
        default:
            return null;
    }
};

/**
 * Evaluate SELECTs without a FROM clause (SELECT 1, SELECT version(), ...)
 * used by clients as connection tests. Returns null when the statement is
 * not a FROM-less select.
 */
const tryHandleConstantSelect = (
    sql: string,
    session: LightdashPgWireSession,
): PgWireQueryResult | null => {
    let statements;
    try {
        statements = parse(sql);
    } catch {
        return null; // let the compiler produce the error message
    }
    if (statements.length !== 1) return null;
    const [statement] = statements;
    if (statement.type !== 'select') return null;
    if (statement.from && statement.from.length > 0) return null;

    const fields: PgWireResultField[] = [];
    const row: (string | null)[] = [];
    for (const col of statement.columns ?? []) {
        const { expr } = col;
        let name = col.alias?.name ?? '?column?';
        let oid = TEXT_OID;
        let value: string | null;
        switch (expr.type) {
            case 'string':
                value = expr.value;
                break;
            case 'integer':
                oid = INT8_OID;
                value = String(expr.value);
                break;
            case 'numeric':
                oid = FLOAT8_OID;
                value = String(expr.value);
                break;
            case 'boolean':
                oid = BOOL_OID;
                value = expr.value ? 't' : 'f';
                break;
            case 'null':
                value = null;
                break;
            case 'call': {
                const fn = expr.function.name.toLowerCase();
                if (!col.alias) name = fn;
                if (fn === 'version') value = VERSION_STRING;
                else if (fn === 'current_database') value = session.projectUuid;
                else if (fn === 'current_schema') value = 'public';
                else if (fn === 'now' || fn === 'current_timestamp') {
                    oid = TIMESTAMP_OID;
                    value = new Date()
                        .toISOString()
                        .replace('T', ' ')
                        .replace('Z', '+00');
                } else return null;
                break;
            }
            case 'keyword': {
                if (!col.alias) name = expr.keyword;
                if (
                    expr.keyword === 'current_user' ||
                    expr.keyword === 'session_user' ||
                    expr.keyword === 'user'
                ) {
                    value = session.account.user?.email ?? 'lightdash';
                } else if (expr.keyword === 'current_catalog') {
                    value = session.projectUuid;
                } else if (expr.keyword === 'current_schema') {
                    value = 'public';
                } else return null;
                break;
            }
            default:
                return null;
        }
        fields.push({ name, oid });
        row.push(value);
    }
    return { type: 'rows', fields, rows: [row], commandTag: 'SELECT 1' };
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createLightdashPgWireHandlers = (
    serviceRepository: ServiceRepository,
): PgWireHandlers<LightdashPgWireSession> => {
    /**
     * The database name can be a project UUID or a slugified project name
     * (e.g. "jaffle-shop"). Projects have no stored slug, so slugs are derived
     * from names at connect time and may be ambiguous - UUIDs always work.
     */
    const resolveProjectUuid = async (
        account: Account,
        database: string,
    ): Promise<string> => {
        if (UUID_PATTERN.test(database)) return database;
        const projects = await serviceRepository
            .getOrganizationService()
            .getProjects(account);
        const wanted = database.toLowerCase();
        const matches = projects.filter(
            (p) =>
                generateSlug(p.name) === wanted ||
                p.name.toLowerCase() === wanted,
        );
        if (matches.length === 1) return matches[0].projectUuid;
        if (matches.length > 1) {
            throw new PgWireServerError(
                `database "${database}" is ambiguous: ${matches.length} projects share that name`,
                '3D000',
                `Use the project UUID instead: ${matches
                    .map((p) => p.projectUuid)
                    .join(', ')}`,
            );
        }
        throw new PgWireServerError(
            `database "${database}" does not exist`,
            '3D000',
            `Use a project UUID or one of: ${projects
                .map((p) => generateSlug(p.name))
                .join(', ')}`,
        );
    };
    const buildCatalog = async (
        account: Account,
        projectUuid: string,
    ): Promise<PgWireTable[]> => {
        const projectService = serviceRepository.getProjectService();
        const summaries = await projectService.getAllExploresSummary(
            account,
            projectUuid,
            true,
            false,
        );
        const tables = await Promise.all(
            summaries.map(async (summary): Promise<PgWireTable | null> => {
                try {
                    const explore = await projectService.getExplore(
                        account,
                        projectUuid,
                        summary.name,
                    );
                    const fields: PgWireField[] = [
                        ...getDimensions(explore)
                            .filter((d) => !d.hidden)
                            .map((d) => ({
                                fieldId: getItemId(d),
                                kind: 'dimension' as const,
                                type: d.type,
                            })),
                        ...getMetrics(explore)
                            .filter((m) => !m.hidden)
                            .map((m) => ({
                                fieldId: getItemId(m),
                                kind: 'metric' as const,
                                type: m.type,
                            })),
                    ];
                    return { name: explore.name, fields };
                } catch (e) {
                    Logger.debug(
                        `pgwire: skipping explore ${summary.name}: ${
                            e instanceof Error ? e.message : e
                        }`,
                    );
                    return null;
                }
            }),
        );
        return tables.filter((t): t is PgWireTable => t !== null);
    };

    return {
        authenticate: async ({ user, database, password }) => {
            if (!password) {
                throw new PgWireServerError(
                    'password authentication failed: provide a Lightdash personal access token as the password',
                    '28P01',
                );
            }
            let sessionUser;
            try {
                sessionUser = await serviceRepository
                    .getUserService()
                    .loginWithPersonalAccessToken(password);
            } catch (e) {
                Logger.info(
                    `pgwire: PAT authentication failed for user "${user}"`,
                );
                throw new PgWireServerError(
                    'password authentication failed: invalid personal access token',
                    '28P01',
                    'Create a token in Lightdash under Settings > Personal access tokens and use it as the password',
                );
            }
            const account = fromApiKey(sessionUser, 'pgwire');
            const projectUuid = await resolveProjectUuid(account, database);
            let catalog: PgWireTable[];
            try {
                catalog = await buildCatalog(account, projectUuid);
            } catch (e) {
                throw new PgWireServerError(
                    `cannot access project "${projectUuid}": ${
                        e instanceof Error ? e.message : e
                    }`,
                    '3D000',
                    'Use the Lightdash project UUID as the database name',
                );
            }
            Logger.info(
                `pgwire: ${sessionUser.email} connected to project ${projectUuid} (${catalog.length} explores)`,
            );
            return { account, projectUuid, catalog };
        },

        query: async (session, sql) => {
            const sessionResult = tryHandleSessionStatement(sql);
            if (sessionResult) return sessionResult;

            const constantResult = tryHandleConstantSelect(sql, session);
            if (constantResult) return constantResult;

            // catalog discovery via information_schema.tables / .columns
            try {
                const infoResult = tryHandleInformationSchema(
                    parse(sql),
                    session.catalog,
                    session.projectUuid,
                );
                if (infoResult) return infoResult;
            } catch (e) {
                if (e instanceof PgWireServerError) throw e;
                // parse errors fall through to the compiler for consistent messages
            }

            let compiled;
            try {
                compiled = compileSqlToMetricQuery(sql, session.catalog);
            } catch (e) {
                if (e instanceof SqlCompileError) {
                    throw compileErrorToServerError(e);
                }
                throw e;
            }

            const results = await serviceRepository
                .getProjectService()
                .runExploreQuery(
                    session.account,
                    compiled.metricQuery,
                    session.projectUuid,
                    compiled.metricQuery.exploreName,
                    undefined, // csvLimit: undefined = respect metricQuery.limit
                    undefined,
                    QueryExecutionContext.API,
                );

            const fields: PgWireResultField[] = compiled.columns.map(
                (column) => ({
                    name: column.name,
                    oid: oidForColumn(column),
                }),
            );
            const rows = results.rows.map((row: ResultRow) =>
                compiled.columns.map((column) =>
                    toTextValue(row[column.source]?.value?.raw, column.type),
                ),
            );
            return {
                type: 'rows',
                fields,
                rows,
                commandTag: `SELECT ${rows.length}`,
            };
        },
    };
};
