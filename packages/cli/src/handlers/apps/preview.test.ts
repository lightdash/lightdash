import { type DataAppCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeBundleToDir } from './appCodeFiles';
import {
    assertNodeModulesPresent,
    buildPreviewEnv,
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

describe('buildPreviewEnv', () => {
    it('keeps the real key server-side and inlines only a sentinel', () => {
        expect(
            buildPreviewEnv({
                serverUrl: 'http://localhost:3000',
                apiKey: 'ldpat_abc',
                projectUuid: 'proj-uuid-1',
            }),
        ).toBe(
            'VITE_LIGHTDASH_URL=http://localhost:3000\n' +
                `VITE_LIGHTDASH_API_KEY=${PREVIEW_API_KEY_SENTINEL}\n` +
                'VITE_LIGHTDASH_PROJECT_UUID=proj-uuid-1\n' +
                'LIGHTDASH_PREVIEW_API_KEY=ldpat_abc\n',
        );
    });

    it('never inlines the real key into a VITE_ (browser) var', () => {
        const env = buildPreviewEnv({
            serverUrl: 'http://localhost:3000',
            apiKey: 'ldpat_secret',
            projectUuid: 'p',
        });
        // The real key must only appear on the non-VITE, server-only line.
        for (const line of env.split('\n')) {
            if (line.startsWith('VITE_')) {
                expect(line).not.toContain('ldpat_secret');
            }
        }
        expect(env).toContain('LIGHTDASH_PREVIEW_API_KEY=ldpat_secret\n');
    });

    it('strips a trailing slash from the server url', () => {
        const env = buildPreviewEnv({
            serverUrl: 'http://localhost:3000/',
            apiKey: 'k',
            projectUuid: 'p',
        });
        expect(env).toContain('VITE_LIGHTDASH_URL=http://localhost:3000\n');
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
