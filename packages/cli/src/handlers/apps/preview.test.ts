import { type DataAppCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeBundleToDir } from './appCodeFiles';
import {
    assertNodeModulesPresent,
    assertScaffoldingSupportsPreviewProxy,
    buildPreviewChildEnv,
    PREVIEW_API_KEY_SENTINEL,
    projectNotFoundMessage,
    resolvePreviewTarget,
} from './preview';

const previewBundle: DataAppCode = {
    manifest: {
        codeVersion: 1 as const,
        appUuid: 'app-uuid-1',
        projectUuid: 'proj-uuid-1',
        version: 2,
        name: 'Preview App',
        description: '',
        template: null,
        downloadedAt: '2026-07-01T00:00:00.000Z',
    },
    files: [],
};

describe('buildPreviewChildEnv', () => {
    it('contains no credential — only the sentinel, proxy address, and nonce', () => {
        const env = buildPreviewChildEnv({
            serverUrl: 'http://localhost:3000',
            projectUuid: 'proj-uuid-1',
            proxyPort: 45678,
            proxyNonce: 'nonce-abc',
        });
        expect(env).toEqual({
            VITE_LIGHTDASH_URL: 'http://localhost:3000',
            VITE_LIGHTDASH_API_KEY: PREVIEW_API_KEY_SENTINEL,
            VITE_LIGHTDASH_PROJECT_UUID: 'proj-uuid-1',
            LIGHTDASH_PREVIEW_PROXY_TARGET: 'http://127.0.0.1:45678',
            LIGHTDASH_PREVIEW_PROXY_NONCE: 'nonce-abc',
        });
        // Nothing that reaches the vite process may hold an ldpat/ldsvc value.
        for (const value of Object.values(env)) {
            expect(value).not.toMatch(/^ld(pat|svc)_/);
        }
    });

    it('strips a trailing slash from the server url', () => {
        const env = buildPreviewChildEnv({
            serverUrl: 'http://localhost:3000/',
            projectUuid: 'p',
            proxyPort: 1,
            proxyNonce: 'n',
        });
        expect(env.VITE_LIGHTDASH_URL).toBe('http://localhost:3000');
    });
});

describe('assertScaffoldingSupportsPreviewProxy', () => {
    it('passes when vite.config.js reads the proxy target', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await fs.writeFile(
            path.join(dir, 'vite.config.js'),
            'const t = env.LIGHTDASH_PREVIEW_PROXY_TARGET;',
        );
        await expect(
            assertScaffoldingSupportsPreviewProxy(dir),
        ).resolves.toBeUndefined();
    });

    it('rejects pre-proxy scaffolding with a re-download instruction', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await fs.writeFile(
            path.join(dir, 'vite.config.js'),
            'const k = env.LIGHTDASH_PREVIEW_API_KEY;',
        );
        await expect(
            assertScaffoldingSupportsPreviewProxy(dir),
        ).rejects.toThrow(/Re-download the app/);
    });
});

describe('resolvePreviewTarget', () => {
    it('defaults appDir to cwd and project to the manifest projectUuid', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await writeBundleToDir(dir, previewBundle);
        const target = await resolvePreviewTarget({ cwd: dir });
        expect(target.appDir).toBe(dir);
        expect(target.projectUuid).toBe('proj-uuid-1');
    });

    it('resolves a relative path arg against cwd and honors --project override', async () => {
        const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        const appDir = path.join(parent, 'apps', 'my-app');
        await writeBundleToDir(appDir, previewBundle);
        const target = await resolvePreviewTarget({
            pathArg: 'apps/my-app',
            projectFlag: 'other-proj',
            cwd: parent,
        });
        expect(target.appDir).toBe(appDir);
        expect(target.projectUuid).toBe('other-proj');
    });

    it('errors clearly when the folder has no manifest', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await expect(resolvePreviewTarget({ cwd: dir })).rejects.toThrow(
            /No lightdash-app\.yml found in/,
        );
    });
});

describe('assertNodeModulesPresent', () => {
    it('passes when node_modules exists', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await fs.mkdir(path.join(dir, 'node_modules'));
        await expect(assertNodeModulesPresent(dir)).resolves.toBeUndefined();
    });

    it('errors telling the user to pnpm install, without installing', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-prev-'));
        await expect(assertNodeModulesPresent(dir)).rejects.toThrow(
            /Run 'pnpm install' in .* \(preview does not auto-install\)/,
        );
    });
});

describe('projectNotFoundMessage', () => {
    it('names the project, the server, and both remedies', () => {
        const msg = projectNotFoundMessage({
            projectUuid: 'proj-uuid-1',
            serverUrl: 'https://cloud.example.com',
        });
        expect(msg).toContain('proj-uuid-1');
        expect(msg).toContain('https://cloud.example.com');
        expect(msg).toMatch(/lightdash login/);
        expect(msg).toMatch(/--project/);
    });
});
