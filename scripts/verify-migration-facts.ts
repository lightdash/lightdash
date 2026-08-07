import {
    compareVersions,
    flattenPlan,
    type MigrationFact,
    type PlanNode,
} from '@lightdash/common';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { parseFactsFile } from './preflight';

export type VerificationFailureReason =
    | 'estimate-sql-error'
    | 'plan-sql-error'
    | 'plan-missing-tables'
    | 'supporting-index-sql-error';

export interface VerificationPass {
    ok: true;
    migration: string;
}

export interface VerificationFailure {
    ok: false;
    migration: string;
    reason: VerificationFailureReason;
    sql: string;
    message: string;
    missingTables: string[];
}

export type VerificationVerdict = VerificationPass | VerificationFailure;

export interface VerificationSummary {
    total: number;
    verified: number;
    skipped: number;
    failed: number;
}

export function summarizeVerdicts(
    results: ReadonlyArray<{ ok: boolean; verified: boolean }>,
): VerificationSummary {
    return {
        total: results.length,
        verified: results.filter((result) => result.verified).length,
        skipped: results.filter((result) => !result.verified).length,
        failed: results.filter((result) => !result.ok).length,
    };
}

export function summaryLine(summary: VerificationSummary): string {
    return `${summary.total} fact(s): ${summary.verified} verified against a database, ${summary.skipped} skipped (no backfill SQL), ${summary.failed} failed`;
}

export function nothingVerifiedError(
    summary: VerificationSummary,
): string | null {
    if (summary.verified > 0) return null;
    return `--require-verified was set but no fact carried backfill SQL, so nothing was checked against a database (${summaryLine(summary)})`;
}

interface ExplainResult {
    Plan?: PlanNode;
}

export interface FactSqlVerifier {
    explain: (sql: string) => Promise<unknown>;
    executeSupportingIndex: (sql: string) => Promise<void>;
}

interface PgClient {
    connect: () => Promise<void>;
    end: () => Promise<void>;
    query: (
        sql: string,
        values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
}

interface KnexClient {
    migrate: { latest: () => Promise<unknown> };
    destroy: () => Promise<void>;
}

interface DatabaseTarget {
    connectionString?: string;
    database?: string;
}

interface CliArgs {
    factsPath: string;
    databaseUrl: string | null;
    defaultPreviousTag: string | null;
    previousTags: Map<string, string>;
    statementTimeoutSeconds: number;
    json: boolean;
    requireVerified: boolean;
}

const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_MIGRATIONS_PATH = 'packages/backend/src/database/migrations';
const backendRequire = createRequire(
    path.join(REPO_ROOT, 'packages/backend/package.json'),
);
const SCRATCH_MIGRATION_ENVIRONMENT = {
    LIGHTDASH_MODE: 'development',
    LIGHTDASH_SECRET: randomBytes(32).toString('hex'),
    S3_BUCKET: 'verify-migration-facts',
    S3_ENDPOINT: 'http://127.0.0.1:1',
    S3_REGION: 'local',
};

const passVerdict = (fact: MigrationFact): VerificationPass => ({
    ok: true,
    migration: fact.migration,
});

export function sqlFailureVerdict(
    fact: MigrationFact,
    reason: Exclude<VerificationFailureReason, 'plan-missing-tables'>,
    sql: string,
    message: string,
): VerificationFailure {
    return {
        ok: false,
        migration: fact.migration,
        reason,
        sql,
        message,
        missingTables: [],
    };
}

function explainPlan(explainJson: unknown): PlanNode | null {
    if (!Array.isArray(explainJson)) return null;
    return (explainJson[0] as ExplainResult | undefined)?.Plan ?? null;
}

function normalizedRelationName(name: string): string {
    return name.replaceAll('"', '').split('.').at(-1)?.toLowerCase() ?? name;
}

export function tablesReferencedByPlan(explainJson: unknown): Set<string> {
    const plan = explainPlan(explainJson);
    if (plan === null) return new Set();
    return new Set(
        flattenPlan(plan)
            .map((node) => node['Relation Name'])
            .filter((name): name is string => name !== undefined)
            .map(normalizedRelationName),
    );
}

export function verifyPlanTables(
    fact: MigrationFact,
    sql: string,
    explainJson: unknown,
): VerificationVerdict {
    const referencedTables = tablesReferencedByPlan(explainJson);
    const missingTables = fact.tables
        .filter((table) =>
            table.access.some(
                (access) => access === 'read' || access === 'write',
            ),
        )
        .map((table) => table.name)
        .filter((table) => !referencedTables.has(normalizedRelationName(table)))
        .sort();

    if (missingTables.length === 0) return passVerdict(fact);
    return {
        ok: false,
        migration: fact.migration,
        reason: 'plan-missing-tables',
        sql,
        message: `EXPLAIN plan does not reference declared table(s): ${missingTables.join(', ')}`,
        missingTables,
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function verifyFact(
    fact: MigrationFact,
    verifier: FactSqlVerifier,
): Promise<VerificationVerdict> {
    if (fact.backfill === null) return passVerdict(fact);

    let estimatePlan: unknown;
    try {
        estimatePlan = await verifier.explain(fact.backfill.estimateSql);
    } catch (error) {
        return sqlFailureVerdict(
            fact,
            'estimate-sql-error',
            fact.backfill.estimateSql,
            errorMessage(error),
        );
    }

    const planSql = fact.backfill.planSql ?? fact.backfill.estimateSql;
    let plan = estimatePlan;
    if (planSql !== fact.backfill.estimateSql) {
        try {
            plan = await verifier.explain(planSql);
        } catch (error) {
            return sqlFailureVerdict(
                fact,
                'plan-sql-error',
                planSql,
                errorMessage(error),
            );
        }
    }

    const planVerdict = verifyPlanTables(fact, planSql, plan);
    if (!planVerdict.ok) return planVerdict;

    if (fact.backfill.supportingIndexSql !== null) {
        try {
            await verifier.executeSupportingIndex(
                fact.backfill.supportingIndexSql,
            );
        } catch (error) {
            return sqlFailureVerdict(
                fact,
                'supporting-index-sql-error',
                fact.backfill.supportingIndexSql,
                errorMessage(error),
            );
        }
    }

    return passVerdict(fact);
}

function gitLines(args: string[]): string[] {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
    })
        .trim()
        .split('\n')
        .filter(Boolean);
}

export function previousReleaseTag(introducedIn: string): string {
    execFileSync('git', ['rev-parse', '--verify', `${introducedIn}^{commit}`], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
    });
    const releaseTags = gitLines([
        'tag',
        '--merged',
        `${introducedIn}^`,
        '--list',
    ]).filter(
        (tag) =>
            /^\d+\.\d+\.\d+$/.test(tag) &&
            compareVersions(tag, introducedIn) < 0,
    );
    const previous = releaseTags.sort(compareVersions).at(-1);
    if (previous === undefined) {
        throw new Error(
            `could not find a release tag before ${introducedIn}; pass --previous-tag`,
        );
    }
    return previous;
}

function historicalMigrationPaths(tag: string): string[] {
    const migrationPathPattern = new RegExp(
        `^${CORE_MIGRATIONS_PATH}/\\d{14}_[^/]+\\.ts$`,
    );
    const paths = gitLines([
        'ls-tree',
        '-r',
        '--name-only',
        tag,
        '--',
        CORE_MIGRATIONS_PATH,
    ]).filter((file) => migrationPathPattern.test(file));
    if (paths.length === 0) {
        throw new Error(`no core migrations found at ${tag}`);
    }
    return paths;
}

export function createHistoricalMigrationDirectory(tag: string): string {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'lightdash-migrations-'),
    );
    try {
        for (const migrationPath of historicalMigrationPaths(tag)) {
            const source = path.join(REPO_ROOT, migrationPath);
            if (!fs.existsSync(source)) {
                throw new Error(
                    `${migrationPath} exists at ${tag} but not in the current tree; historical reconstruction requires append-only migrations`,
                );
            }
            fs.symlinkSync(source, path.join(directory, path.basename(source)));
        }
        return directory;
    } catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}

function connectionTarget(
    databaseUrl: string | null,
    database?: string,
): DatabaseTarget {
    const connectionString = databaseUrl ?? process.env.PGCONNECTIONURI;
    if (connectionString !== undefined && connectionString !== null) {
        if (database === undefined) return { connectionString };
        const url = new URL(connectionString);
        url.pathname = `/${database}`;
        return { connectionString: url.toString() };
    }
    return database === undefined ? {} : { database };
}

function scratchDatabaseName(): string {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `verify_migration_facts_${process.pid}_${suffix}`;
}

function quoteIdentifier(identifier: string): string {
    if (!/^[a-z0-9_]+$/.test(identifier)) {
        throw new Error(`unsafe database identifier: ${identifier}`);
    }
    return `"${identifier}"`;
}

function pgClient(target: DatabaseTarget): PgClient {
    const { Client } = backendRequire('pg') as {
        Client: new (config: DatabaseTarget) => PgClient;
    };
    return new Client(target);
}

async function createScratchDatabase(
    databaseUrl: string | null,
    name: string,
): Promise<void> {
    const client = pgClient(connectionTarget(databaseUrl));
    await client.connect();
    try {
        await client.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
    } finally {
        await client.end();
    }
}

async function dropScratchDatabase(
    databaseUrl: string | null,
    name: string,
): Promise<void> {
    const client = pgClient(connectionTarget(databaseUrl));
    await client.connect();
    try {
        await client.query(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
        );
    } finally {
        await client.end();
    }
}

async function migrateScratchDatabase(
    target: DatabaseTarget,
    migrationDirectory: string,
): Promise<void> {
    const previousEnvironment = new Map(
        Object.keys(SCRATCH_MIGRATION_ENVIRONMENT).map((name) => [
            name,
            process.env[name],
        ]),
    );
    Object.assign(process.env, SCRATCH_MIGRATION_ENVIRONMENT);
    let knex: KnexClient | null = null;
    try {
        const knexFactory = backendRequire('knex') as (
            config: unknown,
        ) => KnexClient;
        knex = knexFactory({
            client: 'pg',
            connection: target,
            pool: { min: 0, max: 1 },
            migrations: {
                directory: migrationDirectory,
                extension: 'ts',
                loadExtensions: ['.ts'],
                tableName: 'knex_migrations',
            },
        });
        await knex.migrate.latest();
    } finally {
        await knex?.destroy();
        for (const [name, value] of previousEnvironment) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
}

function postgresVerifier(
    client: PgClient,
    statementTimeoutSeconds: number,
): FactSqlVerifier {
    const explain = async (sql: string): Promise<unknown> => {
        await client.query('BEGIN TRANSACTION READ ONLY');
        try {
            await client.query(
                "SELECT set_config('statement_timeout', $1, true)",
                [`${statementTimeoutSeconds}s`],
            );
            const result = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
            return result.rows[0]?.['QUERY PLAN'];
        } finally {
            await client.query('ROLLBACK');
        }
    };
    return {
        explain,
        executeSupportingIndex: async (sql: string): Promise<void> => {
            await client.query(
                "SELECT set_config('statement_timeout', $1, false)",
                [`${statementTimeoutSeconds}s`],
            );
            try {
                await client.query(sql);
            } finally {
                await client.query(
                    "SELECT set_config('statement_timeout', '0', false)",
                );
            }
        },
    };
}

async function verifyAgainstHistoricalSchema(
    fact: MigrationFact,
    previousTag: string,
    databaseUrl: string | null,
    statementTimeoutSeconds: number,
): Promise<VerificationVerdict> {
    if (fact.backfill === null) return passVerdict(fact);
    const migrationDirectory = createHistoricalMigrationDirectory(previousTag);
    const databaseName = scratchDatabaseName();
    let databaseCreated = false;
    try {
        await createScratchDatabase(databaseUrl, databaseName);
        databaseCreated = true;
        const target = connectionTarget(databaseUrl, databaseName);
        await migrateScratchDatabase(target, migrationDirectory);
        const client = pgClient(target);
        await client.connect();
        try {
            return await verifyFact(
                fact,
                postgresVerifier(client, statementTimeoutSeconds),
            );
        } finally {
            await client.end();
        }
    } finally {
        fs.rmSync(migrationDirectory, { recursive: true, force: true });
        if (databaseCreated) {
            await dropScratchDatabase(databaseUrl, databaseName);
        }
    }
}

function requiredValue(argv: string[], index: number, flag: string): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
    }
    return value;
}

export function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {
        factsPath: path.join(REPO_ROOT, 'scripts/migration-facts.json'),
        databaseUrl: null,
        defaultPreviousTag: null,
        previousTags: new Map(),
        statementTimeoutSeconds: 30,
        json: false,
        requireVerified: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--facts') {
            args.factsPath = path.resolve(requiredValue(argv, index, flag));
            index += 1;
        } else if (flag === '--database-url') {
            args.databaseUrl = requiredValue(argv, index, flag);
            index += 1;
        } else if (flag === '--previous-tag') {
            const value = requiredValue(argv, index, flag);
            const separator = value.indexOf('=');
            if (separator === -1) {
                args.defaultPreviousTag = value;
            } else {
                args.previousTags.set(
                    value.slice(0, separator),
                    value.slice(separator + 1),
                );
            }
            index += 1;
        } else if (flag === '--statement-timeout') {
            const value = Number(requiredValue(argv, index, flag));
            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(
                    '--statement-timeout must be a positive number',
                );
            }
            args.statementTimeoutSeconds = value;
            index += 1;
        } else if (flag === '--json') {
            args.json = true;
        } else if (flag === '--require-verified') {
            args.requireVerified = true;
        } else {
            throw new Error(`unknown argument: ${flag}`);
        }
    }
    return args;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const facts = parseFactsFile(fs.readFileSync(args.factsPath, 'utf-8'));
    const hasConnectionEnvironment = [
        'PGCONNECTIONURI',
        'PGDATABASE',
        'PGHOST',
        'PGPORT',
        'PGUSER',
        'PGPASSWORD',
    ].some((name) => process.env[name] !== undefined);
    if (
        facts.migrationFacts.some((fact) => fact.backfill !== null) &&
        args.databaseUrl === null &&
        !hasConnectionEnvironment
    ) {
        throw new Error(
            'database connection required: pass --database-url or set PGCONNECTIONURI / standard PG* variables. CI should provide an empty-capable Postgres service whose user can CREATE DATABASE',
        );
    }
    const results: Array<
        VerificationVerdict & { previousTag: string | null; verified: boolean }
    > = [];
    for (const fact of facts.migrationFacts) {
        if (fact.backfill === null) {
            results.push({
                ...passVerdict(fact),
                previousTag: null,
                verified: false,
            });
            continue;
        }
        const previousTag =
            args.previousTags.get(fact.migration) ??
            args.defaultPreviousTag ??
            previousReleaseTag(fact.introducedIn);
        const verdict = await verifyAgainstHistoricalSchema(
            fact,
            previousTag,
            args.databaseUrl,
            args.statementTimeoutSeconds,
        );
        results.push({ ...verdict, previousTag, verified: true });
        if (!args.json) {
            console.log(
                `[verify-migration-facts] ${fact.migration} against ${previousTag}: ${verdict.ok ? 'PASS' : `FAIL (${verdict.reason}: ${verdict.message})`}`,
            );
        }
    }
    const summary = summarizeVerdicts(results);
    const nothingVerified = args.requireVerified
        ? nothingVerifiedError(summary)
        : null;
    if (args.json) {
        console.log(JSON.stringify({ summary, results }, null, 2));
    } else {
        console.log(`[verify-migration-facts] ${summaryLine(summary)}`);
    }
    if (nothingVerified !== null) {
        console.error(`[verify-migration-facts] ${nothingVerified}`);
    }
    if (results.some((result) => !result.ok) || nothingVerified !== null) {
        process.exitCode = 1;
    }
}

const isMain = process.argv[1]?.endsWith('verify-migration-facts.ts') === true;
if (isMain) {
    main().catch((error) => {
        console.error(
            `[verify-migration-facts] FAILED: ${errorMessage(error)}`,
        );
        process.exitCode = 1;
    });
}
