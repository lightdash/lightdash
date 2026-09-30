import { WarehouseConnectionError } from '@lightdash/common';
import { createHash } from 'crypto';
import fsSync from 'fs';
import path from 'path';

export const EMBEDDED_BUNDLE_CHECKSUMS_FILE = 'SHA256SUMS';
export const EMBEDDED_BUNDLE_EXPLORES_FILE = 'explores.json';
export const EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY = 'previous';

export type EmbeddedBundle = {
    directory: string;
    version: string;
    checksums: ReadonlyMap<string, string>;
};

const CHECKSUM_LINE = /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/;

export const getEmbeddedDatabaseFileName = (dataset: string) =>
    `${dataset}.duckdb`;

export const parseEmbeddedBundleChecksums = (
    text: string,
): Map<string, string> => {
    const checksums = new Map<string, string>();
    text.split('\n')
        .filter((line) => line !== '')
        .forEach((line) => {
            const match = CHECKSUM_LINE.exec(line);
            if (!match) {
                throw new WarehouseConnectionError(
                    `${EMBEDDED_BUNDLE_CHECKSUMS_FILE} has an invalid line: ${line}`,
                );
            }
            const [, digest, fileName] = match;
            if (checksums.has(fileName)) {
                throw new WarehouseConnectionError(
                    `${EMBEDDED_BUNDLE_CHECKSUMS_FILE} lists ${fileName} more than once`,
                );
            }
            checksums.set(fileName, digest);
        });
    return checksums;
};

/** Identifies a database and the explores compiled from it, so a change to either gives a new version. */
export const getEmbeddedBundleVersion = (
    checksums: ReadonlyMap<string, string>,
    dataset: string,
): string => {
    const databaseFile = getEmbeddedDatabaseFileName(dataset);
    const exploresDigest = checksums.get(EMBEDDED_BUNDLE_EXPLORES_FILE);
    const databaseDigest = checksums.get(databaseFile);
    if (!exploresDigest || !databaseDigest) {
        throw new WarehouseConnectionError(
            `${EMBEDDED_BUNDLE_CHECKSUMS_FILE} must list ${EMBEDDED_BUNDLE_EXPLORES_FILE} and ${databaseFile}`,
        );
    }
    return createHash('sha256')
        .update(
            `${exploresDigest}  ${EMBEDDED_BUNDLE_EXPLORES_FILE}\n${databaseDigest}  ${databaseFile}\n`,
        )
        .digest('hex')
        .slice(0, 16);
};

export const readEmbeddedBundle = (
    directory: string,
    dataset: string,
): EmbeddedBundle | null => {
    let text: string;
    try {
        text = fsSync.readFileSync(
            path.join(directory, EMBEDDED_BUNDLE_CHECKSUMS_FILE),
            'utf8',
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
    const checksums = parseEmbeddedBundleChecksums(text);
    return {
        directory,
        version: getEmbeddedBundleVersion(checksums, dataset),
        checksums,
    };
};

const fileDigests = new Map<string, { statKey: string; digest: string }>();

export const getFileSha256 = (filePath: string): string => {
    const stat = fsSync.statSync(filePath);
    const statKey = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    const cached = fileDigests.get(filePath);
    if (cached?.statKey === statKey) return cached.digest;
    const digest = createHash('sha256')
        .update(fsSync.readFileSync(filePath))
        .digest('hex');
    fileDigests.set(filePath, { statKey, digest });
    return digest;
};

const fileMatchesDigest = (filePath: string, digest: string) =>
    fsSync.existsSync(filePath) && getFileSha256(filePath) === digest;

/** Returns the path of a bundle file after checking it against the bundle's checksum. */
export const verifyEmbeddedBundleFile = (
    bundle: EmbeddedBundle,
    fileName: string,
): string => {
    const expected = bundle.checksums.get(fileName);
    if (!expected) {
        throw new WarehouseConnectionError(
            `${EMBEDDED_BUNDLE_CHECKSUMS_FILE} in ${bundle.directory} does not list ${fileName}`,
        );
    }
    const filePath = path.join(bundle.directory, fileName);
    if (!fsSync.existsSync(filePath)) {
        throw new WarehouseConnectionError(
            `${fileName} is missing from ${bundle.directory}`,
        );
    }
    const actual = getFileSha256(filePath);
    if (actual !== expected) {
        throw new WarehouseConnectionError(
            `${fileName} in ${bundle.directory} does not match ${EMBEDDED_BUNDLE_CHECKSUMS_FILE}: expected ${expected}, found ${actual}`,
        );
    }
    return filePath;
};

export const readEmbeddedBundles = (
    baseDirectory: string,
    dataset: string,
): { current: EmbeddedBundle | null; previous: EmbeddedBundle | null } => ({
    current: readEmbeddedBundle(baseDirectory, dataset),
    previous: readEmbeddedBundle(
        path.join(baseDirectory, EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY),
        dataset,
    ),
});

/**
 * Finds the database for a bundle version among the current bundle and the
 * one retained from the previous release. Two versions can share a database
 * file, so the match is by checksum rather than by directory.
 */
export const resolveEmbeddedBundleDatabasePath = (
    baseDirectory: string,
    dataset: string,
    bundleVersion: string,
): string => {
    const { current, previous } = readEmbeddedBundles(baseDirectory, dataset);
    const available = [current, previous].filter(
        (bundle): bundle is EmbeddedBundle => bundle !== null,
    );
    const bundle = available.find(({ version }) => version === bundleVersion);
    if (!bundle) {
        throw new WarehouseConnectionError(
            `Sample data version mismatch: the project uses version ${bundleVersion}, but this server has ${
                available.map(({ version }) => version).join(' and ') ||
                'no versioned sample data'
            }`,
        );
    }
    const databaseFile = getEmbeddedDatabaseFileName(dataset);
    const digest = bundle.checksums.get(databaseFile);
    const databasePath = [bundle, ...available]
        .map(({ directory }) => path.join(directory, databaseFile))
        .find((candidate) =>
            digest ? fileMatchesDigest(candidate, digest) : false,
        );
    if (!databasePath) {
        throw new WarehouseConnectionError(
            `Sample data version ${bundleVersion} needs ${databaseFile} with checksum ${digest}, but no file on this server matches it`,
        );
    }
    return databasePath;
};
