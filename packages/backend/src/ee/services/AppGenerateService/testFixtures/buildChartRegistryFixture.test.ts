import { chartRegistryIndexSchema } from '@lightdash/common';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extract } from 'tar-stream';
import { buildChartRegistryFixture } from './buildChartRegistryFixture';

function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

/** Reads back every entry name in a tar buffer via tar-stream's extract(). */
function listTarEntryNames(buffer: Buffer): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const names: string[] = [];
        const extractor = extract();
        extractor.on('entry', (header, stream, next) => {
            names.push(header.name);
            stream.on('end', next);
            stream.resume();
        });
        extractor.on('finish', () => resolve(names));
        extractor.on('error', reject);
        extractor.end(buffer);
    });
}

/** Reads back every entry's name -> utf-8 content in a tar buffer. */
function readTarFiles(buffer: Buffer): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
        const files: Record<string, string> = {};
        const extractor = extract();
        extractor.on('entry', (header, stream, next) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
                files[header.name] = Buffer.concat(chunks).toString('utf-8');
                next();
            });
            stream.resume();
        });
        extractor.on('finish', () => resolve(files));
        extractor.on('error', reject);
        extractor.end(buffer);
    });
}

describe('buildChartRegistryFixture', () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = await mkdtemp(path.join(tmpdir(), 'chart-registry-fixture-'));
    });

    afterEach(async () => {
        await rm(outDir, { recursive: true, force: true });
    });

    it('writes an index.json that parses via chartRegistryIndexSchema', async () => {
        const { indexPath } = await buildChartRegistryFixture({ outDir });

        const raw = await readFile(indexPath, 'utf-8');
        const parsed = chartRegistryIndexSchema.parse(JSON.parse(raw));

        expect(parsed.charts).toHaveLength(1);
        expect(parsed.charts[0].slug).toBe('fixture-gauge');
        expect(parsed.charts[0].version).toBe('1.0.0');
        expect(parsed.charts[0].changelog).toBe('Initial fixture release.');
    });

    it('bumps the version and changelog when given a different version', async () => {
        const { index } = await buildChartRegistryFixture({
            outDir,
            version: '1.1.0',
        });

        expect(index.charts[0].version).toBe('1.1.0');
        expect(index.charts[0].changelog).toBe('Fixture upgrade');
    });

    it('digests in the index match the actual artifact bytes on disk', async () => {
        const { index } = await buildChartRegistryFixture({
            outDir,
            version: '1.2.3',
        });
        const entry = index.charts[0];

        const sourceBuffer = await readFile(
            path.join(outDir, entry.artifacts.source.path),
        );
        const distBuffer = await readFile(
            path.join(outDir, entry.artifacts.dist.path),
        );

        expect(sha256(sourceBuffer)).toBe(entry.artifacts.source.sha256);
        expect(sha256(distBuffer)).toBe(entry.artifacts.dist.sha256);
    });

    it('thumbnail and screenshot files exist at the paths declared in the index', async () => {
        const { index } = await buildChartRegistryFixture({ outDir });
        const entry = index.charts[0];

        expect(entry.thumbnail).not.toBeNull();
        await expect(
            readFile(path.join(outDir, entry.thumbnail as string)),
        ).resolves.toBeInstanceOf(Buffer);
        await expect(
            readFile(path.join(outDir, entry.screenshots[0])),
        ).resolves.toBeInstanceOf(Buffer);
    });

    it('dist.tar entries are all prefixed with dist/, matching the install extraction contract', async () => {
        const { index } = await buildChartRegistryFixture({ outDir });
        const entry = index.charts[0];
        const distBuffer = await readFile(
            path.join(outDir, entry.artifacts.dist.path),
        );

        const names = await listTarEntryNames(distBuffer);

        expect(names.length).toBeGreaterThan(0);
        names.forEach((name) => expect(name.startsWith('dist/')).toBe(true));
        expect(names).toContain('dist/index.html');
        expect(names).toContain('dist/assets/app.js');
    });

    it('index.html has no inline script — only an external module script tag (CSP has no script-src unsafe-inline)', async () => {
        const { index } = await buildChartRegistryFixture({ outDir });
        const entry = index.charts[0];
        const distBuffer = await readFile(
            path.join(outDir, entry.artifacts.dist.path),
        );
        const files = await readTarFiles(distBuffer);
        const indexHtml = files['dist/index.html'];

        const scriptTags = [
            ...indexHtml.matchAll(/<script\b[^>]*>([^<]*)<\/script>/g),
        ];
        expect(scriptTags).toHaveLength(1);
        const [fullTag, body] = scriptTags[0];
        expect(fullTag).toMatch(/type="module"/);
        expect(fullTag).toMatch(/src="\.\/assets\/app\.js"/);
        expect(body.trim()).toBe('');
    });

    it('source.tar entries are all prefixed with src/', async () => {
        const { index } = await buildChartRegistryFixture({ outDir });
        const entry = index.charts[0];
        const sourceBuffer = await readFile(
            path.join(outDir, entry.artifacts.source.path),
        );

        const names = await listTarEntryNames(sourceBuffer);

        expect(names.length).toBeGreaterThan(0);
        names.forEach((name) => expect(name.startsWith('src/')).toBe(true));
    });

    it('rejects a non-semver version before writing anything', async () => {
        await expect(
            buildChartRegistryFixture({ outDir, version: 'not-a-version' }),
        ).rejects.toThrow();
    });
});
