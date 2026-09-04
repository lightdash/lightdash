import {
    AuthTokenPrefix,
    generateSlug,
    getDimensions,
    getItemId,
    getMetrics,
    QueryExecutionContext,
    ServiceAccountScope,
    type Account,
    type ResultRow,
} from '@lightdash/common';
import { parse } from 'pgsql-ast-parser';
import { fromApiKey, fromServiceAccount } from '../../auth/account/account';
import Logger from '../../logging/logger';
import type { ServiceRepository } from '../../services/ServiceRepository';
import type { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';
import { tryHandleCatalogQuery } from './pgCatalog/catalogQuery';
import {
    buildCatalogRelations,
    type CatalogRelation,
} from './pgCatalog/catalogRelations';
import { fieldTypeOid, PG_OID } from './pgTypes';
import {
    PgWireServerError,
    type PgWireHandlers,
    type PgWireQueryResult,
    type PgWireResultField,
} from './PostgresWireServer';
import { compileSqlToMetricQuery, SqlCompileError } from './sqlToMetricQuery';
import {
    type PgWireColumn,
    type PgWireCompiledQuery,
    type PgWireField,
    type PgWireTable,
} from './types';

export type LightdashPgWireSession = {
    account: Account;
    projectUuid: string;
    /** the database name the client connected with (project UUID or slug), echoed back as current_database() */
    databaseName: string;
    catalog: PgWireTable[];
    /** the system catalog describing `catalog`, built once per connection */
    catalogRelations: Map<string, CatalogRelation>;
};

const TEXT_OID = PG_OID.text;

const oidForColumn = (column: PgWireColumn): number =>
    fieldTypeOid(column.type);

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
 * Postgres accepts multiword spellings for a few settings, and drivers use
 * them: pgjdbc's `getTransactionIsolation()` sends
 * `SHOW TRANSACTION ISOLATION LEVEL`.
 */
const SHOW_PARAMETER_ALIASES: Record<string, string> = {
    'transaction isolation level': 'transaction_isolation',
    'time zone': 'timezone',
};

/**
 * Handle transaction/session statements that BI tools and drivers send but
 * that have no meaning against the semantic layer. Returns null when the
 * statement should be compiled as a real query.
 */
const tryHandleSessionStatement = (sql: string): PgWireQueryResult | null => {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const [firstWord = '', secondWord = ''] = (
        /^(\w+)(?:\s+(\w+))?/.exec(trimmed) ?? []
    )
        .slice(1)
        .map((word) => word?.toUpperCase() ?? '');
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
            return {
                type: 'command',
                commandTag: secondWord === 'ALL' ? 'DISCARD ALL' : 'DISCARD',
            };
        case 'DEALLOCATE':
            return { type: 'command', commandTag: 'DEALLOCATE' };
        case 'SHOW': {
            const argument = trimmed
                .slice(firstWord.length)
                .trim()
                .replace(/\s+/g, ' ')
                .toLowerCase();
            const param = SHOW_PARAMETER_ALIASES[argument] ?? argument;
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

/** Statement shape for logs without the values clients put in string literals */
const redactLiterals = (sql: string): string =>
    sql.replace(/'(?:[^']|'')*'/g, "'?'");

const parses = (sql: string): boolean => {
    try {
        parse(sql);
        return true;
    } catch {
        return false;
    }
};

const escapeRegex = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Postgres accepts fully qualified `database.schema.table` names when the
 * database is the current one, but the SQL parser used here only understands
 * two parts. Connectors (e.g. Domo previews) fully qualify, so when a
 * statement only parses after removing the session database qualifier, use
 * the stripped form.
 */
const stripDatabaseQualifier = (sql: string, databaseName: string): string => {
    const quoted = `"${escapeRegex(databaseName)}"`;
    const bare = /^[a-z_][a-z0-9_]*$/.test(databaseName)
        ? `|\\b${escapeRegex(databaseName)}\\b`
        : '';
    const qualifier = new RegExp(
        `(?:${quoted}${bare})\\.(?=(?:"(?:[^"]|"")+"|[A-Za-z_][\\w$]*)\\.)`,
        'g',
    );
    return sql.replace(qualifier, '');
};

const normalizeSql = (session: LightdashPgWireSession, sql: string): string => {
    if (!sql.includes(session.databaseName) || parses(sql)) {
        return sql;
    }
    const stripped = stripDatabaseQualifier(sql, session.databaseName);
    return stripped !== sql && parses(stripped) ? stripped : sql;
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Session statements, constant SELECTs and information_schema lookups are
 * answered in memory; anything else compiles to a metric query that only
 * `query` runs. `describe` shares this so it always agrees with `query`.
 */
type ResolvedStatement =
    | { kind: 'result'; result: PgWireQueryResult }
    | { kind: 'explore'; compiled: PgWireCompiledQuery };

const resolveStatement = (
    session: LightdashPgWireSession,
    rawSql: string,
): ResolvedStatement => {
    const sql = normalizeSql(session, rawSql);
    const sessionResult = tryHandleSessionStatement(sql);
    if (sessionResult) {
        return { kind: 'result', result: sessionResult };
    }

    const catalogResult = tryHandleCatalogQuery(sql, {
        databaseName: session.databaseName,
        userName: session.account.user?.email ?? 'lightdash',
        catalog: session.catalog,
        relations: session.catalogRelations,
    });
    if (catalogResult) {
        return { kind: 'result', result: catalogResult };
    }

    try {
        return {
            kind: 'explore',
            compiled: compileSqlToMetricQuery(sql, session.catalog),
        };
    } catch (e) {
        if (e instanceof SqlCompileError) {
            throw compileErrorToServerError(e);
        }
        throw e;
    }
};

const fieldsOf = (compiled: PgWireCompiledQuery): PgWireResultField[] =>
    compiled.columns.map((column) => ({
        name: column.name,
        oid: oidForColumn(column),
    }));

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
                    const describe = (field: {
                        label: string;
                        description?: string;
                    }): string | null =>
                        field.description?.trim() || field.label || null;
                    const fields: PgWireField[] = [
                        ...getDimensions(explore)
                            .filter((d) => !d.hidden)
                            .map((d) => ({
                                fieldId: getItemId(d),
                                table: d.table,
                                name: d.name,
                                kind: 'dimension' as const,
                                type: d.type,
                                description: describe(d),
                            })),
                        ...getMetrics(explore)
                            .filter((m) => !m.hidden)
                            .map((m) => ({
                                fieldId: getItemId(m),
                                table: m.table,
                                name: m.name,
                                kind: 'metric' as const,
                                type: m.type,
                                description: describe(m),
                            })),
                    ];
                    return {
                        name: explore.name,
                        fields,
                        description:
                            explore.tables[
                                explore.baseTable
                            ]?.description?.trim() ||
                            explore.label ||
                            null,
                    };
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

    /**
     * Authenticate a service account token (ldsvc_) into an Account. Mirrors
     * the checks in `authenticateServiceAccount` middleware: rejects unknown
     * tokens and SCIM-only tokens, then derives abilities from the SA scopes.
     */
    const authenticateServiceAccountToken = async (
        token: string,
    ): Promise<Account> => {
        const serviceAccount = await serviceRepository
            .getServiceAccountService<ServiceAccountService>()
            .authenticateServiceAccount(token);
        if (!serviceAccount) {
            throw new PgWireServerError(
                'password authentication failed: invalid service account token',
                '28P01',
            );
        }
        const isScimOnly =
            serviceAccount.scopes.length === 1 &&
            serviceAccount.scopes[0] === ServiceAccountScope.SCIM_MANAGE;
        if (isScimOnly) {
            throw new PgWireServerError(
                'password authentication failed: SCIM-only tokens cannot access the semantic layer',
                '28P01',
            );
        }
        const sessionUser = await serviceRepository
            .getUserService()
            .getSessionUserForServiceAccount(serviceAccount);
        return fromServiceAccount(
            {
                ...sessionUser,
                serviceAccount: {
                    uuid: serviceAccount.uuid,
                    description: serviceAccount.description,
                },
            },
            'pgwire',
        );
    };

    const authenticatePatToken = async (token: string): Promise<Account> => {
        const sessionUser = await serviceRepository
            .getUserService()
            .loginWithPersonalAccessToken(token);
        return fromApiKey(sessionUser, 'pgwire');
    };

    const runStatement = async (
        session: LightdashPgWireSession,
        sql: string,
    ): Promise<PgWireQueryResult> => {
        const resolved = resolveStatement(session, sql);
        if (resolved.kind === 'result') {
            return resolved.result;
        }
        const { compiled } = resolved;
        if (compiled.alwaysEmpty) {
            // schema probes (WHERE 1=0, LIMIT 0) never reach the warehouse
            return {
                type: 'rows',
                fields: fieldsOf(compiled),
                rows: [],
                commandTag: 'SELECT 0',
            };
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

        const fields = fieldsOf(compiled);
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
    };

    return {
        authenticate: async ({ user, database, password }) => {
            if (!password) {
                throw new PgWireServerError(
                    'password authentication failed: provide a Lightdash service account token (ldsvc_) or personal access token (ldpat_) as the password',
                    '28P01',
                    'Set up a service account under Settings > Service accounts (recommended), or a personal access token under Settings > Personal access tokens, and use it as the password',
                );
            }
            const isServiceAccount = password.startsWith(
                AuthTokenPrefix.SERVICE_ACCOUNT,
            );
            let account: Account;
            try {
                account = isServiceAccount
                    ? await authenticateServiceAccountToken(password)
                    : await authenticatePatToken(password);
            } catch (e) {
                if (e instanceof PgWireServerError) throw e;
                Logger.info(
                    `pgwire: ${
                        isServiceAccount ? 'service account' : 'PAT'
                    } authentication failed for user "${user}"`,
                );
                throw new PgWireServerError(
                    `password authentication failed: invalid ${
                        isServiceAccount
                            ? 'service account token'
                            : 'personal access token'
                    }`,
                    '28P01',
                    isServiceAccount
                        ? 'Create a service account in Lightdash under Settings > Service accounts and use its token as the password'
                        : 'Create a token in Lightdash under Settings > Personal access tokens and use it as the password',
                );
            }
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
                `pgwire: ${
                    account.user?.email ?? account.authentication.type
                } connected to project ${projectUuid} (${
                    catalog.length
                } explores)`,
            );
            return {
                account,
                projectUuid,
                databaseName: database,
                catalog,
                catalogRelations: buildCatalogRelations({
                    databaseName: database,
                    userName: account.user?.email ?? 'lightdash',
                    catalog,
                }),
            };
        },

        describe: async (session, sql) => {
            try {
                const resolved = resolveStatement(session, sql);
                if (resolved.kind === 'result') {
                    return resolved.result.type === 'rows'
                        ? resolved.result.fields
                        : null;
                }
                return fieldsOf(resolved.compiled);
            } catch (e) {
                // Parse/Describe failures never reach the query handler, so
                // extended-protocol clients (pgjdbc) would fail invisibly
                Logger.warn(
                    `pgwire: describe failed (${e instanceof PgWireServerError ? e.code : 'unexpected'}: ${e instanceof Error ? redactLiterals(e.message).slice(0, 300) : e}) sql: ${redactLiterals(sql).slice(0, 300)}`,
                );
                throw e;
            }
        },

        query: async (session, sql) => {
            Logger.debug(
                `pgwire: ${session.account.user?.email ?? 'service account'} query: ${redactLiterals(sql).slice(0, 500)}`,
            );
            try {
                return await runStatement(session, sql);
            } catch (e) {
                // failures are otherwise only visible to the client; log the
                // shape (literals redacted) so production issues are diagnosable
                Logger.warn(
                    `pgwire: query failed (${e instanceof PgWireServerError ? e.code : 'unexpected'}: ${e instanceof Error ? redactLiterals(e.message).slice(0, 200) : e}) sql: ${redactLiterals(sql).slice(0, 300)}`,
                );
                throw e;
            }
        },
    };
};
