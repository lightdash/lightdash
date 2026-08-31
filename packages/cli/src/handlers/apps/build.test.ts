import {
    ParameterError,
    type DataAppCode,
    type DataAppManifest,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBundleFromDir, writeBundleToDir } from './appCodeFiles';
import { appsBuildHandler, assertOutDirDoesNotContainAppDir } from './build';
import { validateDataAppBuild, type RunDataAppBuildCommand } from './validate';

const defaultManifest: DataAppManifest = {
    codeVersion: 1,
    projectUuid: 'project-uuid',
    slug: 'orders-app',
    version: 1,
    name: 'Orders app',
    description: '',
    template: null,
    downloadedAt: '2026-08-01T00:00:00.000Z',
    externalConnections: [],
};

const validSource = `
    import { query } from '@lightdash/query-sdk';
    query('orders').dimensions(['status']);
`;

const makeApp = async (): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-build-'));
    const code: DataAppCode = {
        manifest: defaultManifest,
        files: [
            {
                path: 'src/App.tsx',
                contentBase64: Buffer.from(validSource).toString('base64'),
            },
        ],
    };
    await writeBundleToDir(dir, code);
    await fs.mkdir(path.join(dir, 'node_modules'));
    return dir;
};

const makeOutDir = async (): Promise<string> =>
    path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), 'ld-app-build-outdir-')),
        'dist',
    );

// Fakes a successful `vite build` by writing dist/index.html into the build
// dir it receives, without actually running Vite.
const fakeSuccessfulViteBuild = async (
    command: Parameters<RunDataAppBuildCommand>[0],
): Promise<void> => {
    if (command.command !== 'vite') return;
    await fs.mkdir(path.join(command.cwd, 'dist'));
    await fs.writeFile(
        path.join(command.cwd, 'dist', 'index.html'),
        '<html>built</html>',
    );
};

describe('validateDataAppBuild outDir', () => {
    it('copies the built dist output into outDir and still cleans the temp build dir', async () => {
        const appDir = await makeApp();
        const bundle = await readBundleFromDir(appDir);
        const outDir = await makeOutDir();
        const buildDirs: string[] = [];
        const runCommand: RunDataAppBuildCommand = async (command) => {
            if (command.command === 'vite') buildDirs.push(command.cwd);
            await fakeSuccessfulViteBuild(command);
        };

        const issues = await validateDataAppBuild({
            appDir,
            bundle,
            runCommand,
            outDir,
        });

        expect(issues).toEqual([]);
        await expect(
            fs.readFile(path.join(outDir, 'index.html'), 'utf-8'),
        ).resolves.toBe('<html>built</html>');

        expect(buildDirs).toHaveLength(1);
        await expect(fs.stat(buildDirs[0])).rejects.toThrow();
    });

    it('clears stale files from a previous build before copying the new output', async () => {
        const appDir = await makeApp();
        const bundle = await readBundleFromDir(appDir);
        const outDir = await makeOutDir();
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(
            path.join(outDir, 'stale-chunk-abc123.js'),
            '// stale',
        );

        const issues = await validateDataAppBuild({
            appDir,
            bundle,
            runCommand: fakeSuccessfulViteBuild,
            outDir,
        });

        expect(issues).toEqual([]);
        await expect(
            fs.readFile(path.join(outDir, 'index.html'), 'utf-8'),
        ).resolves.toBe('<html>built</html>');
        await expect(
            fs.stat(path.join(outDir, 'stale-chunk-abc123.js')),
        ).rejects.toThrow();
    });

    it('does not copy anything and leaves a pre-existing outDir untouched when the build fails', async () => {
        const appDir = await makeApp();
        const bundle = await readBundleFromDir(appDir);
        const outDir = await makeOutDir();
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(path.join(outDir, 'previous-build.js'), '// kept');
        const viteError = Object.assign(new Error('Command failed'), {
            stderr: 'src/App.tsx:1: broken import',
        });

        const issues = await validateDataAppBuild({
            appDir,
            bundle,
            outDir,
            runCommand: vi.fn().mockRejectedValue(viteError),
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'build',
                message: expect.stringContaining('broken import'),
            }),
        ]);
        await expect(
            fs.readFile(path.join(outDir, 'previous-build.js'), 'utf-8'),
        ).resolves.toBe('// kept');
    });
});

describe('appsBuildHandler', () => {
    it('fails fast with a ParameterError when the directory has no lightdash-app.yml', async () => {
        const dir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ld-app-build-missing-'),
        );

        await expect(appsBuildHandler(dir, { verbose: false })).rejects.toThrow(
            ParameterError,
        );
    });

    it('fails fast with a ParameterError when the bundle has no files under src/', async () => {
        const dir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ld-app-build-empty-'),
        );
        await writeBundleToDir(dir, { manifest: defaultManifest, files: [] });

        await expect(appsBuildHandler(dir, { verbose: false })).rejects.toThrow(
            /no files under src\//,
        );
    });

    it('refuses --out-dir equal to the app directory before doing any build work', async () => {
        const appDir = await makeApp();

        await expect(
            appsBuildHandler(appDir, { outDir: appDir, verbose: false }),
        ).rejects.toThrow(ParameterError);
        // The app bundle must still be intact — no wipe happened.
        await expect(
            fs.stat(path.join(appDir, 'src', 'App.tsx')),
        ).resolves.toBeDefined();
    });

    it('refuses --out-dir that is a parent of the app directory before doing any build work', async () => {
        const parentDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ld-app-build-parent-'),
        );
        const appDir = path.join(parentDir, 'app');
        await fs.mkdir(appDir);
        const code: DataAppCode = {
            manifest: defaultManifest,
            files: [
                {
                    path: 'src/App.tsx',
                    contentBase64: Buffer.from(validSource).toString('base64'),
                },
            ],
        };
        await writeBundleToDir(appDir, code);
        await fs.mkdir(path.join(appDir, 'node_modules'));

        await expect(
            appsBuildHandler(appDir, {
                outDir: parentDir,
                verbose: false,
            }),
        ).rejects.toThrow(ParameterError);
        await expect(
            fs.stat(path.join(appDir, 'src', 'App.tsx')),
        ).resolves.toBeDefined();
    });
});

describe('assertOutDirDoesNotContainAppDir', () => {
    it('throws when outDir equals appDir', () => {
        expect(() =>
            assertOutDirDoesNotContainAppDir(
                '/repo/apps/orders',
                '/repo/apps/orders',
            ),
        ).toThrow(ParameterError);
    });

    it('throws when appDir is nested inside outDir', () => {
        expect(() =>
            assertOutDirDoesNotContainAppDir('/repo/apps/orders', '/repo/apps'),
        ).toThrow(ParameterError);
    });

    it('throws when outDir is the filesystem root and appDir is anywhere under it', () => {
        expect(() =>
            assertOutDirDoesNotContainAppDir('/repo/apps/orders', '/'),
        ).toThrow(ParameterError);
    });

    it('does not throw for a normal sibling out-dir', () => {
        expect(() =>
            assertOutDirDoesNotContainAppDir(
                '/repo/apps/orders',
                '/repo/build-output',
            ),
        ).not.toThrow();
    });

    it('does not throw for the default outDir nested inside appDir (appDir/dist)', () => {
        expect(() =>
            assertOutDirDoesNotContainAppDir(
                '/repo/apps/orders',
                '/repo/apps/orders/dist',
            ),
        ).not.toThrow();
    });
});
