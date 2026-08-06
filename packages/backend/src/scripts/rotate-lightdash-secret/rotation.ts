import { Knex } from 'knex';
import { LightdashSecrets } from '../../config/parseConfig';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { hashWithSecret } from '../../utils/hash';
import { CIPHERTEXT_REGISTRY, CiphertextRegistryEntry } from './registry';

export type RotationOptions = {
    execute: boolean;
    batchSize: number;
    /** Registry table filter; null means every registered table */
    tables: string[] | null;
};

export type CiphertextScanResult = {
    table: string;
    column: string;
    primaryKeyColumn: string;
    tablePresent: boolean;
    scanned: number;
    active: number;
    fallback: number;
    reEncrypted: number;
    concurrentSkips: number;
    /** Primary keys of rows whose ciphertext no configured secret can read */
    unreadablePrimaryKeys: string[];
};

export type GraphileJobsScanResult = {
    schemaPresent: boolean;
    scanned: number;
    active: number;
    fallback: number;
    reEncrypted: number;
    concurrentSkips: number;
    unreadableJobIds: string[];
};

export type TokenHashClassification = {
    table: string;
    tablePresent: boolean;
    total: number;
    active: number;
    /** Count per configured fallback, in keyring order */
    fallback: number[];
    legacySha256: number;
    unknown: number;
};

export type SecretRotationReport = {
    mode: 'dry-run' | 'execute';
    ciphertext: CiphertextScanResult[];
    graphileJobs: GraphileJobsScanResult;
    tokenHashes: TokenHashClassification[];
    blockers: string[];
    hasUnreadableValues: boolean;
};

export type RotationContext = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
    lightdashSecrets: LightdashSecrets;
};

const CREATE_PROJECT_TASK = 'createProjectWithCompile';
const LEGACY_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BCRYPT_PREFIX_LENGTH = '$2b$10$'.length + 22;
const CLASSIFICATION_SENTINEL = 'lightdash-secret-rotation-sentinel';

// Both bounds stay small so combined connection demand (table scans times
// per-page updates) never exhausts the default knex pool.
const TABLE_SCAN_CONCURRENCY = 2;
const UPDATE_CONCURRENCY = 4;

const TOKEN_HASH_TABLES: ReadonlyArray<{
    table: string;
    primaryKeyColumn: string;
}> = [
    {
        table: 'personal_access_tokens',
        primaryKeyColumn: 'personal_access_token_uuid',
    },
    { table: 'service_accounts', primaryKeyColumn: 'service_account_uuid' },
];

// Runs at most `concurrency` handlers in flight and preserves input order in
// the results. Workers advance through a shared index by recursing instead of
// looping, so independent work is parallel without unbounded fan-out.
async function mapWithBoundedConcurrency<Item, Result>(
    items: readonly Item[],
    concurrency: number,
    handle: (item: Item) => Promise<Result>,
): Promise<Result[]> {
    const results = new Array<Result>(items.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
            return;
        }
        results[index] = await handle(items[index]);
        await worker();
    };
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, () =>
            worker(),
        ),
    );
    return results;
}

// Async cursor pagination: fetches pages of at most `batchSize` rows ordered
// by a stable key and handles each page before fetching the next, keeping
// memory and query duration bounded on large tables.
async function forEachPage<Row>(
    batchSize: number,
    fetchPage: (cursor: unknown) => Promise<Row[]>,
    getCursor: (row: Row) => unknown,
    handlePage: (rows: Row[]) => Promise<void>,
): Promise<void> {
    const step = async (cursor: unknown): Promise<void> => {
        const rows = await fetchPage(cursor);
        if (rows.length === 0) {
            return;
        }
        await handlePage(rows);
        if (rows.length < batchSize) {
            return;
        }
        await step(getCursor(rows[rows.length - 1]));
    };
    await step(null);
}

async function scanRegistryEntry(
    { database, encryptionUtil }: RotationContext,
    entry: CiphertextRegistryEntry,
    options: Pick<RotationOptions, 'execute' | 'batchSize'>,
): Promise<CiphertextScanResult> {
    const result: CiphertextScanResult = {
        table: entry.table,
        column: entry.column,
        primaryKeyColumn: entry.primaryKeyColumn,
        tablePresent: await database.schema.hasTable(entry.table),
        scanned: 0,
        active: 0,
        fallback: 0,
        reEncrypted: 0,
        concurrentSkips: 0,
        unreadablePrimaryKeys: [],
    };
    if (!result.tablePresent) {
        return result;
    }
    await forEachPage<Record<string, unknown>>(
        options.batchSize,
        async (cursor) => {
            const query = database(entry.table)
                .select([entry.primaryKeyColumn, entry.column])
                .whereNotNull(entry.column)
                .orderBy(entry.primaryKeyColumn, 'asc')
                .limit(options.batchSize);
            if (cursor !== null) {
                void query.where(entry.primaryKeyColumn, '>', cursor as never);
            }
            const rows: Record<string, unknown>[] = await query;
            return rows;
        },
        (row) => row[entry.primaryKeyColumn],
        async (rows) => {
            const pendingReEncryptions: {
                primaryKey: unknown;
                ciphertext: Buffer;
                plaintext: string;
            }[] = [];
            for (const row of rows) {
                const primaryKey = row[entry.primaryKeyColumn];
                const ciphertext = row[entry.column] as Buffer;
                result.scanned += 1;
                let decrypted = null;
                try {
                    decrypted = encryptionUtil.decryptWithMeta(ciphertext);
                } catch {
                    result.unreadablePrimaryKeys.push(String(primaryKey));
                }
                if (decrypted !== null) {
                    if (decrypted.keySource.type === 'active') {
                        result.active += 1;
                    } else {
                        result.fallback += 1;
                        if (options.execute) {
                            pendingReEncryptions.push({
                                primaryKey,
                                ciphertext,
                                plaintext: decrypted.value,
                            });
                        }
                    }
                }
            }
            await mapWithBoundedConcurrency(
                pendingReEncryptions,
                UPDATE_CONCURRENCY,
                async ({ primaryKey, ciphertext, plaintext }) => {
                    const updatedRows = await database(entry.table)
                        .where(entry.primaryKeyColumn, primaryKey as never)
                        .andWhere(entry.column, ciphertext)
                        .update({
                            [entry.column]: encryptionUtil.encrypt(plaintext),
                        });
                    if (updatedRows === 0) {
                        result.concurrentSkips += 1;
                    } else {
                        result.reEncrypted += 1;
                    }
                },
            );
        },
    );
    return result;
}

export async function rotateRegisteredCiphertext(
    context: RotationContext,
    options: RotationOptions,
): Promise<CiphertextScanResult[]> {
    const entries = CIPHERTEXT_REGISTRY.filter(
        (entry) =>
            options.tables === null || options.tables.includes(entry.table),
    );
    return mapWithBoundedConcurrency(entries, TABLE_SCAN_CONCURRENCY, (entry) =>
        scanRegistryEntry(context, entry, options),
    );
}

export async function rotateQueuedCreateProjectJobs(
    { database, encryptionUtil }: RotationContext,
    options: Pick<RotationOptions, 'execute' | 'batchSize'>,
): Promise<GraphileJobsScanResult> {
    const result: GraphileJobsScanResult = {
        schemaPresent: await database.schema
            .withSchema('graphile_worker')
            .hasTable('jobs'),
        scanned: 0,
        active: 0,
        fallback: 0,
        reEncrypted: 0,
        concurrentSkips: 0,
        unreadableJobIds: [],
    };
    if (!result.schemaPresent) {
        return result;
    }
    type JobRow = { id: string; data: string | null };
    await forEachPage<JobRow>(
        options.batchSize,
        async (cursor) => {
            // Only unlocked jobs: a locked job is being processed by a worker
            // and must not be modified underneath it.
            const { rows } = (await database.raw(
                `SELECT id, payload->>'data' AS data
                 FROM graphile_worker.jobs
                 WHERE task_identifier = ? AND locked_at IS NULL${
                     cursor !== null ? ' AND id > ?' : ''
                 }
                 ORDER BY id ASC
                 LIMIT ?`,
                cursor !== null
                    ? [CREATE_PROJECT_TASK, cursor as string, options.batchSize]
                    : [CREATE_PROJECT_TASK, options.batchSize],
            )) as { rows: JobRow[] };
            return rows;
        },
        (row) => row.id,
        async (rows) => {
            const pendingReEncryptions: {
                id: string;
                data: string;
                plaintext: string;
            }[] = [];
            for (const row of rows.filter((jobRow) => jobRow.data)) {
                result.scanned += 1;
                let decrypted = null;
                try {
                    decrypted = encryptionUtil.decryptWithMeta(
                        Buffer.from(row.data as string, 'base64'),
                    );
                } catch {
                    result.unreadableJobIds.push(String(row.id));
                }
                if (decrypted !== null) {
                    if (decrypted.keySource.type === 'active') {
                        result.active += 1;
                    } else {
                        result.fallback += 1;
                        if (options.execute) {
                            pendingReEncryptions.push({
                                id: row.id,
                                data: row.data as string,
                                plaintext: decrypted.value,
                            });
                        }
                    }
                }
            }
            await mapWithBoundedConcurrency(
                pendingReEncryptions,
                UPDATE_CONCURRENCY,
                async ({ id, data, plaintext }) => {
                    const reEncrypted = encryptionUtil
                        .encrypt(plaintext)
                        .toString('base64');
                    const updateResult = (await database.raw(
                        `UPDATE graphile_worker.jobs
                         SET payload = jsonb_set(payload::jsonb, '{data}', to_jsonb(?::text), true)
                         WHERE id = ? AND locked_at IS NULL AND payload->>'data' = ?`,
                        [reEncrypted, id, data],
                    )) as { rowCount: number };
                    if (updateResult.rowCount === 0) {
                        result.concurrentSkips += 1;
                    } else {
                        result.reEncrypted += 1;
                    }
                },
            );
        },
    );
    return result;
}

// Classifies stored bcrypt hashes by their canonical 29-character prefix
// ($2b$10$ + 22 salt chars). The prefix comes from a real bcrypt output per
// candidate secret because bcrypt canonicalizes the supplied salt: the raw
// derived salt string can differ from what bcrypt stores.
export async function classifyTokenHashes(
    { database, lightdashSecrets }: RotationContext,
    options: Pick<RotationOptions, 'batchSize'>,
): Promise<TokenHashClassification[]> {
    const candidatePrefixes = await Promise.all(
        lightdashSecrets.all.map(async (secret) =>
            (await hashWithSecret(CLASSIFICATION_SENTINEL, secret)).slice(
                0,
                BCRYPT_PREFIX_LENGTH,
            ),
        ),
    );
    return mapWithBoundedConcurrency(
        TOKEN_HASH_TABLES,
        TABLE_SCAN_CONCURRENCY,
        async ({ table, primaryKeyColumn }) => {
            const result: TokenHashClassification = {
                table,
                tablePresent: await database.schema.hasTable(table),
                total: 0,
                active: 0,
                fallback: lightdashSecrets.fallbacks.map(() => 0),
                legacySha256: 0,
                unknown: 0,
            };
            if (!result.tablePresent) {
                return result;
            }
            await forEachPage<Record<string, unknown>>(
                options.batchSize,
                async (cursor) => {
                    const query = database(table)
                        .select('token_hash', primaryKeyColumn)
                        .orderBy(primaryKeyColumn, 'asc')
                        .limit(options.batchSize);
                    if (cursor !== null) {
                        void query.where(
                            primaryKeyColumn,
                            '>',
                            cursor as never,
                        );
                    }
                    const rows: Record<string, unknown>[] = await query;
                    return rows;
                },
                (row) => row[primaryKeyColumn],
                async (rows) => {
                    for (const row of rows) {
                        result.total += 1;
                        const tokenHash = row.token_hash as string;
                        const candidateIndex = candidatePrefixes.findIndex(
                            (prefix) => tokenHash.startsWith(prefix),
                        );
                        if (candidateIndex === 0) {
                            result.active += 1;
                        } else if (candidateIndex > 0) {
                            result.fallback[candidateIndex - 1] += 1;
                        } else if (LEGACY_SHA256_PATTERN.test(tokenHash)) {
                            result.legacySha256 += 1;
                        } else {
                            result.unknown += 1;
                        }
                    }
                },
            );
            return result;
        },
    );
}

const collectBlockers = (
    report: Omit<SecretRotationReport, 'blockers' | 'hasUnreadableValues'>,
): string[] => {
    const blockers: string[] = [];
    const fallbackCiphertext = report.ciphertext.reduce(
        (sum, r) => sum + r.fallback - r.reEncrypted,
        0,
    );
    if (fallbackCiphertext > 0) {
        blockers.push(
            `${fallbackCiphertext} registered ciphertext value(s) still require a fallback secret`,
        );
    }
    const unreadable = report.ciphertext.reduce(
        (sum, r) => sum + r.unreadablePrimaryKeys.length,
        0,
    );
    if (unreadable > 0) {
        blockers.push(
            `${unreadable} ciphertext value(s) are unreadable with every configured secret`,
        );
    }
    const concurrentSkips =
        report.ciphertext.reduce((sum, r) => sum + r.concurrentSkips, 0) +
        report.graphileJobs.concurrentSkips;
    if (concurrentSkips > 0) {
        blockers.push(
            `${concurrentSkips} concurrent skip(s); rerun until a dry-run reports zero`,
        );
    }
    const fallbackJobs =
        report.graphileJobs.fallback - report.graphileJobs.reEncrypted;
    if (fallbackJobs > 0) {
        blockers.push(
            `${fallbackJobs} queued ${CREATE_PROJECT_TASK} job(s) still require a fallback secret`,
        );
    }
    if (report.graphileJobs.unreadableJobIds.length > 0) {
        blockers.push(
            `${report.graphileJobs.unreadableJobIds.length} queued ${CREATE_PROJECT_TASK} job(s) are unreadable with every configured secret`,
        );
    }
    const fallbackTokenHashes = report.tokenHashes.reduce(
        (sum, r) => sum + r.fallback.reduce((a, b) => a + b, 0),
        0,
    );
    if (fallbackTokenHashes > 0) {
        blockers.push(
            `${fallbackTokenHashes} token hash(es) still derive from a fallback secret; reissue or revoke the credentials before removing the fallback`,
        );
    }
    return blockers;
};

export async function runSecretRotation(
    context: RotationContext,
    options: RotationOptions,
): Promise<SecretRotationReport> {
    const ciphertext = await rotateRegisteredCiphertext(context, options);
    const graphileJobs = await rotateQueuedCreateProjectJobs(context, options);
    const tokenHashes = await classifyTokenHashes(context, options);
    const partialReport = {
        mode: options.execute ? ('execute' as const) : ('dry-run' as const),
        ciphertext,
        graphileJobs,
        tokenHashes,
    };
    return {
        ...partialReport,
        blockers: collectBlockers(partialReport),
        hasUnreadableValues:
            ciphertext.some((r) => r.unreadablePrimaryKeys.length > 0) ||
            graphileJobs.unreadableJobIds.length > 0,
    };
}
