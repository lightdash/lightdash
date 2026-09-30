import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    getEmbeddedBundleVersion,
    parseEmbeddedBundleChecksums,
    readEmbeddedBundle,
    resolveEmbeddedBundleDatabasePath,
    verifyEmbeddedBundleFile,
} from './duckdbEmbeddedBundle';

const sha256 = (contents: string) =>
    createHash('sha256').update(contents).digest('hex');

describe('duckdbEmbeddedBundle', () => {
    let baseDirectory: string;

    const writeBundle = async (
        directory: string,
        files: Record<string, string>,
        listed: Record<string, string> = files,
    ) => {
        await fs.mkdir(directory, { recursive: true });
        await Promise.all(
            Object.entries(files).map(([name, contents]) =>
                fs.writeFile(path.join(directory, name), contents),
            ),
        );
        await fs.writeFile(
            path.join(directory, 'SHA256SUMS'),
            Object.entries(listed)
                .map(([name, contents]) => `${sha256(contents)}  ${name}`)
                .join('\n')
                .concat('\n'),
        );
        const bundle = readEmbeddedBundle(directory, 'sample');
        if (!bundle) throw new Error('bundle was not written');
        return bundle;
    };

    beforeEach(async () => {
        baseDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-embedded-bundle-'),
        );
    });

    afterEach(async () => {
        await fs.rm(baseDirectory, { recursive: true, force: true });
    });

    it('rejects malformed and duplicate checksum lines', () => {
        expect(() =>
            parseEmbeddedBundleChecksums('abc  explores.json\n'),
        ).toThrow('SHA256SUMS has an invalid line: abc  explores.json');
        const line = `${'a'.repeat(64)}  explores.json`;
        expect(() =>
            parseEmbeddedBundleChecksums(`${line}\n${line}\n`),
        ).toThrow('SHA256SUMS lists explores.json more than once');
    });

    it('derives the version from the explores and database digests only', () => {
        const checksums = new Map([
            ['explores.json', 'a'.repeat(64)],
            ['sample.duckdb', 'b'.repeat(64)],
        ]);
        const version = getEmbeddedBundleVersion(checksums, 'sample');

        expect(version).toMatch(/^[0-9a-f]{16}$/);
        expect(
            getEmbeddedBundleVersion(
                new Map([...checksums, ['content.json', 'c'.repeat(64)]]),
                'sample',
            ),
        ).toBe(version);
        expect(
            getEmbeddedBundleVersion(
                new Map([...checksums, ['sample.duckdb', 'd'.repeat(64)]]),
                'sample',
            ),
        ).not.toBe(version);
        expect(() =>
            getEmbeddedBundleVersion(
                new Map([['explores.json', 'a'.repeat(64)]]),
                'sample',
            ),
        ).toThrow('SHA256SUMS must list explores.json and sample.duckdb');
    });

    it('returns null when a directory has no bundle', () => {
        expect(readEmbeddedBundle(baseDirectory, 'sample')).toBeNull();
    });

    it('verifies a bundle file against its checksum', async () => {
        const bundle = await writeBundle(
            baseDirectory,
            { 'explores.json': '[]', 'sample.duckdb': 'database' },
            { 'explores.json': '[1]', 'sample.duckdb': 'database' },
        );

        expect(verifyEmbeddedBundleFile(bundle, 'sample.duckdb')).toBe(
            path.join(baseDirectory, 'sample.duckdb'),
        );
        expect(() => verifyEmbeddedBundleFile(bundle, 'explores.json')).toThrow(
            `explores.json in ${baseDirectory} does not match SHA256SUMS`,
        );
        expect(() => verifyEmbeddedBundleFile(bundle, 'content.json')).toThrow(
            'does not list content.json',
        );
    });

    it('resolves the current and the retained previous version', async () => {
        const current = await writeBundle(baseDirectory, {
            'explores.json': '["current"]',
            'sample.duckdb': 'current database',
        });
        const previous = await writeBundle(
            path.join(baseDirectory, 'previous'),
            {
                'explores.json': '["previous"]',
                'sample.duckdb': 'previous database',
            },
        );

        expect(
            resolveEmbeddedBundleDatabasePath(
                baseDirectory,
                'sample',
                current.version,
            ),
        ).toBe(path.join(baseDirectory, 'sample.duckdb'));
        expect(
            resolveEmbeddedBundleDatabasePath(
                baseDirectory,
                'sample',
                previous.version,
            ),
        ).toBe(path.join(baseDirectory, 'previous', 'sample.duckdb'));
    });

    it('serves a previous version from the current database when the bytes match', async () => {
        await writeBundle(baseDirectory, {
            'explores.json': '["current"]',
            'sample.duckdb': 'shared database',
        });
        const previous = await writeBundle(
            path.join(baseDirectory, 'previous'),
            { 'explores.json': '["previous"]' },
            {
                'explores.json': '["previous"]',
                'sample.duckdb': 'shared database',
            },
        );

        expect(
            resolveEmbeddedBundleDatabasePath(
                baseDirectory,
                'sample',
                previous.version,
            ),
        ).toBe(path.join(baseDirectory, 'sample.duckdb'));
    });

    it('names both sides of a version mismatch', async () => {
        const current = await writeBundle(baseDirectory, {
            'explores.json': '[]',
            'sample.duckdb': 'database',
        });

        expect(() =>
            resolveEmbeddedBundleDatabasePath(
                baseDirectory,
                'sample',
                'ffffffffffffffff',
            ),
        ).toThrow(
            `Sample data version mismatch: the project uses version ffffffffffffffff, but this server has ${current.version}`,
        );
    });

    it('refuses a database that no longer matches its checksum', async () => {
        const current = await writeBundle(baseDirectory, {
            'explores.json': '[]',
            'sample.duckdb': 'database',
        });
        await fs.writeFile(
            path.join(baseDirectory, 'sample.duckdb'),
            'partially replaced',
        );

        expect(() =>
            resolveEmbeddedBundleDatabasePath(
                baseDirectory,
                'sample',
                current.version,
            ),
        ).toThrow(
            `Sample data version ${current.version} needs sample.duckdb with checksum`,
        );
    });
});
