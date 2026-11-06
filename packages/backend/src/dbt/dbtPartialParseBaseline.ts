import { getErrorMessage } from '@lightdash/common';
import { createHash, randomUUID } from 'crypto';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';

export const DBT_PARTIAL_PARSE_FILE = 'partial_parse.msgpack';

const BASELINE_EXTENSION = '.msgpack';
const DIGEST_EXTENSION = '.external_nodes.sha256';

export const DBT_PARTIAL_PARSE_BASELINE_ROOT = path.join(
    os.tmpdir(),
    'lightdash-dbt-partial-parse',
);

export const DBT_PARTIAL_PARSE_BASELINE_LIMITS = {
    maxBytes: 2 * 1024 ** 3,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    abandonedWriteAgeMs: 60 * 60 * 1000,
};

type BaselineLimits = typeof DBT_PARTIAL_PARSE_BASELINE_LIMITS;

export const getDbtPartialParseBaselineLimits = (
    diskBudgetBytes = Number(process.env.DBT_SOURCE_FETCH_DISK_BUDGET_BYTES),
): BaselineLimits => ({
    ...DBT_PARTIAL_PARSE_BASELINE_LIMITS,
    maxBytes:
        Number.isFinite(diskBudgetBytes) && diskBudgetBytes > 0
            ? Math.min(
                  DBT_PARTIAL_PARSE_BASELINE_LIMITS.maxBytes,
                  Math.floor(diskBudgetBytes / 4),
              )
            : DBT_PARTIAL_PARSE_BASELINE_LIMITS.maxBytes,
});

export const getDbtPartialParseBaselineSize = (
    root = DBT_PARTIAL_PARSE_BASELINE_ROOT,
): number => {
    const walk = (directory: string): number =>
        fsSync
            .readdirSync(directory, { withFileTypes: true })
            .reduce((bytes, entry) => {
                const filename = path.join(directory, entry.name);
                if (entry.isDirectory()) return bytes + walk(filename);
                return entry.isFile()
                    ? bytes + fsSync.statSync(filename).size
                    : bytes;
            }, 0);
    try {
        return walk(root);
    } catch {
        return 0;
    }
};

/**
 * One baseline per project and dbt source. `dbtSourceUuid` is null for the
 * project's own dbt connection.
 */
export const getDbtPartialParseBaselinePath = ({
    projectUuid,
    dbtSourceUuid,
    root = DBT_PARTIAL_PARSE_BASELINE_ROOT,
}: {
    projectUuid: string;
    dbtSourceUuid: string | null;
    root?: string;
}): string =>
    path.join(
        root,
        `${createHash('sha256')
            .update(`${projectUuid}:${dbtSourceUuid ?? 'project'}`)
            .digest('hex')
            .slice(0, 32)}${BASELINE_EXTENSION}`,
    );

const isMissingFileError = (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * Copies the baseline into a dbt target directory. Resolves false when there
 * is no baseline yet or it cannot be read, so dbt does a full parse.
 */
export const seedDbtPartialParse = async (
    baselinePath: string,
    targetDirectory: string,
): Promise<boolean> => {
    try {
        await fs.copyFile(
            baselinePath,
            path.join(targetDirectory, DBT_PARTIAL_PARSE_FILE),
        );
        return true;
    } catch (error) {
        if (!isMissingFileError(error)) {
            Logger.warn(
                `Could not seed dbt partial parse baseline: ${getErrorMessage(error)}`,
            );
        }
        return false;
    }
};

export const getDbtPartialParseExternalNodesDigest = async (
    baselinePath: string,
    targetDirectory: string,
): Promise<string | null> => {
    try {
        const saved: unknown = JSON.parse(
            await fs.readFile(`${baselinePath}${DIGEST_EXTENSION}`, 'utf8'),
        );
        if (
            typeof saved !== 'object' ||
            saved === null ||
            !('payloadDigest' in saved) ||
            typeof saved.payloadDigest !== 'string' ||
            !('partialParseDigest' in saved)
        )
            return null;
        const digest = createHash('sha256')
            .update(
                await fs.readFile(
                    path.join(targetDirectory, DBT_PARTIAL_PARSE_FILE),
                ),
            )
            .digest('hex');
        return saved.partialParseDigest === digest ? saved.payloadDigest : null;
    } catch {
        return null;
    }
};

export const pruneDbtPartialParseBaselines = async (
    root: string,
    now: number,
    limits: BaselineLimits = getDbtPartialParseBaselineLimits(),
): Promise<void> => {
    const names = await fs.readdir(root);
    const files = (
        await Promise.all(
            names.map(async (name) => {
                const filePath = path.join(root, name);
                try {
                    const stats = await fs.stat(filePath);
                    return {
                        filePath,
                        size: stats.size,
                        mtimeMs: stats.mtimeMs,
                    };
                } catch {
                    return null;
                }
            }),
        )
    ).filter((entry) => entry !== null);
    const byPath = new Map(files.map((entry) => [entry.filePath, entry]));
    const entries = files
        .filter(
            (entry) =>
                !entry.filePath.endsWith(DIGEST_EXTENSION) ||
                !byPath.has(entry.filePath.slice(0, -DIGEST_EXTENSION.length)),
        )
        .map((entry) => {
            const isBaseline = entry.filePath.endsWith(BASELINE_EXTENSION);
            const sidecar = isBaseline
                ? byPath.get(`${entry.filePath}${DIGEST_EXTENSION}`)
                : undefined;
            return {
                ...entry,
                isBaseline,
                size: entry.size + (sidecar?.size ?? 0),
                paths: sidecar
                    ? [entry.filePath, sidecar.filePath]
                    : [entry.filePath],
            };
        });

    const expired = entries.filter((entry) =>
        entry.isBaseline
            ? now - entry.mtimeMs > limits.maxAgeMs
            : now - entry.mtimeMs > limits.abandonedWriteAgeMs,
    );
    const newestFirst = entries
        .filter((entry) => entry.isBaseline && !expired.includes(entry))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    let keptBytes = 0;
    const overLimit = newestFirst.filter((entry) => {
        keptBytes += entry.size;
        return keptBytes > limits.maxBytes;
    });

    await Promise.all(
        [...expired, ...overLimit].flatMap((entry) =>
            entry.paths.map((filePath) => fs.rm(filePath, { force: true })),
        ),
    );
};

/**
 * Stores the partial_parse.msgpack that dbt wrote to the target directory as
 * the baseline for the next compile. The write goes to a temporary file in
 * the same directory and is renamed into place, so a concurrent seed never
 * reads a half-written file. Failures are logged and never fail the compile.
 */
export const saveDbtPartialParse = async (
    baselinePath: string,
    targetDirectory: string,
    limits: BaselineLimits = getDbtPartialParseBaselineLimits(),
    externalNodesDigest: string | null = null,
): Promise<void> => {
    const root = path.dirname(baselinePath);
    const temporaryPath = `${baselinePath}.${randomUUID()}.tmp`;
    try {
        await fs.mkdir(root, { recursive: true, mode: 0o700 });
        await fs.copyFile(
            path.join(targetDirectory, DBT_PARTIAL_PARSE_FILE),
            temporaryPath,
        );
        await fs.chmod(temporaryPath, 0o600);
        await fs.rename(temporaryPath, baselinePath);
        if (externalNodesDigest !== null) {
            const partialParseDigest = createHash('sha256')
                .update(
                    await fs.readFile(
                        path.join(targetDirectory, DBT_PARTIAL_PARSE_FILE),
                    ),
                )
                .digest('hex');
            await fs.writeFile(
                `${baselinePath}${DIGEST_EXTENSION}`,
                JSON.stringify({
                    payloadDigest: externalNodesDigest,
                    partialParseDigest,
                }),
                { mode: 0o600 },
            );
        }
        await pruneDbtPartialParseBaselines(root, Date.now(), limits);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        if (!isMissingFileError(error)) {
            Logger.warn(
                `Could not save dbt partial parse baseline: ${getErrorMessage(error)}`,
            );
        }
    }
};
