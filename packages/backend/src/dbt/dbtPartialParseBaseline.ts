import { getErrorMessage } from '@lightdash/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';

export const DBT_PARTIAL_PARSE_FILE = 'partial_parse.msgpack';

const BASELINE_EXTENSION = '.msgpack';

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

export const pruneDbtPartialParseBaselines = async (
    root: string,
    now: number,
    limits: BaselineLimits = DBT_PARTIAL_PARSE_BASELINE_LIMITS,
): Promise<void> => {
    const names = await fs.readdir(root);
    const entries = (
        await Promise.all(
            names.map(async (name) => {
                const filePath = path.join(root, name);
                try {
                    const stats = await fs.stat(filePath);
                    return {
                        filePath,
                        isBaseline: name.endsWith(BASELINE_EXTENSION),
                        size: stats.size,
                        mtimeMs: stats.mtimeMs,
                    };
                } catch {
                    return null;
                }
            }),
        )
    ).filter((entry) => entry !== null);

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
        [...expired, ...overLimit].map((entry) =>
            fs.rm(entry.filePath, { force: true }),
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
    limits: BaselineLimits = DBT_PARTIAL_PARSE_BASELINE_LIMITS,
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
