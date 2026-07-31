import execa from 'execa';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as os from 'os';
import * as path from 'path';
import type { Mock } from 'vitest';
import { LightdashAnalytics } from '../../analytics/analytics';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import { checkLightdashVersion, lightdashApi } from '../dbt/apiClient';
import { selectProject } from '../selectProject';
import { readBundleFromDir } from './appCodeFiles';
import {
    buildLocalAppManifest,
    createAppHandler,
    resolveLocalAppSlug,
} from './createApp';

vi.mock('../../config', () => ({ getConfig: vi.fn() }));
vi.mock('../dbt/apiClient', () => ({
    checkLightdashVersion: vi.fn(),
    lightdashApi: vi.fn(),
}));
vi.mock('../selectProject', () => ({
    selectProject: vi.fn(),
    logSelectedProject: vi.fn(),
}));
vi.mock('../../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('execa');
vi.mock('inquirer', () => ({
    default: { prompt: vi.fn() },
}));

const execaMock = execa as unknown as Mock;
const promptMock = inquirer.prompt as unknown as Mock;

const PROJECT_UUID = '11111111-1111-4111-8111-111111111111';

const context = {
    semanticLayer: {
        path: '.lightdash/context/semantic-layer.yml',
        contentBase64: Buffer.from('models: []\n').toString('base64'),
    },
    parameters: null,
    promptHistory: {
        path: '.lightdash/context/prompt-history.md',
        contentBase64: Buffer.from(
            '# Prompt history\n\n_No previous versions._\n',
        ).toString('base64'),
    },
    theme: { instructions: null, assets: [], skippedAssetCount: 0 },
};

describe('resolveLocalAppSlug', () => {
    it('generates a slug from the app name', () => {
        expect(resolveLocalAppSlug('Revenue Explorer')).toBe(
            'revenue-explorer',
        );
    });

    it('accepts a valid explicit slug', () => {
        expect(resolveLocalAppSlug('Revenue Explorer', 'sales-overview')).toBe(
            'sales-overview',
        );
    });

    it('rejects an invalid explicit slug', () => {
        expect(() =>
            resolveLocalAppSlug('Revenue Explorer', '../invalid'),
        ).toThrow('Invalid data app slug');
    });
});

describe('buildLocalAppManifest', () => {
    it('builds a slug-identified manifest without an app uuid', () => {
        const manifest = buildLocalAppManifest({
            name: 'Revenue Explorer',
            description: 'Revenue by customer',
            projectUuid: PROJECT_UUID,
            slug: 'revenue-explorer',
            now: new Date('2026-07-30T10:00:00.000Z'),
        });

        expect(manifest).toMatchObject({
            codeVersion: 1,
            projectUuid: PROJECT_UUID,
            slug: 'revenue-explorer',
            version: 1,
            name: 'Revenue Explorer',
            description: 'Revenue by customer',
            template: null,
            downloadedAt: '2026-07-30T10:00:00.000Z',
        });
        expect(manifest.appUuid).toBeUndefined();
    });
});

describe('createAppHandler', () => {
    beforeEach(() => {
        execaMock.mockImplementation(
            async (
                command: string,
                args: string[] = [],
                options?: { cwd?: string },
            ) => {
                if (
                    command === 'npx' &&
                    args.includes('init') &&
                    options?.cwd
                ) {
                    await fs.writeFile(
                        path.join(options.cwd, 'package.json'),
                        '{}\n',
                    );
                    await fs.writeFile(
                        path.join(options.cwd, 'tailwind.config.js'),
                        '// rewritten by shadcn\n',
                    );
                }
                if (command === 'npx' && args.includes('add') && options?.cwd) {
                    const uiDir = path.join(options.cwd, 'src/components/ui');
                    await fs.mkdir(uiDir, { recursive: true });
                    await fs.writeFile(
                        path.join(uiDir, 'button.tsx'),
                        'export const Button = () => null;\n',
                    );
                }
                return { stdout: '' };
            },
        );
        promptMock.mockResolvedValue({ confirmed: true });
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                apiKey: 'token',
                serverUrl: 'https://lightdash.example.com',
                project: PROJECT_UUID,
            },
        } as never);
        vi.mocked(selectProject).mockResolvedValue({
            projectUuid: PROJECT_UUID,
            isPreview: false,
        });
        vi.mocked(lightdashApi).mockResolvedValue(context);
        vi.mocked(checkLightdashVersion).mockResolvedValue(undefined);
        vi.spyOn(GlobalState, 'log').mockImplementation(() => undefined);
        vi.spyOn(GlobalState, 'isNonInteractive').mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('creates a complete local app scaffold and project context', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));

        await createAppHandler('Revenue Explorer', {
            description: 'Revenue by customer',
            path: root,
            verbose: false,
        });

        const appDir = path.join(root, 'apps', 'revenue-explorer');
        const bundle = await readBundleFromDir(appDir);
        expect(bundle.manifest.slug).toBe('revenue-explorer');
        expect(bundle.manifest.appUuid).toBeUndefined();
        expect(bundle.files.map((file) => file.path)).toContain('src/App.jsx');
        expect(bundle.files.map((file) => file.path)).toContain(
            'src/components/ui/button.tsx',
        );
        expect(
            await fs.readFile(path.join(appDir, 'package.json'), 'utf8'),
        ).toContain('@lightdash/query-sdk');
        expect(
            await fs.readFile(path.join(appDir, 'tailwind.config.js'), 'utf8'),
        ).not.toContain('rewritten by shadcn');
        await expect(
            fs.access(
                path.join(appDir, '.claude/skills/lightdash-data-app/SKILL.md'),
            ),
        ).resolves.toBeUndefined();
        await expect(
            fs.access(
                path.join(
                    appDir,
                    '.claude/skills/developing-data-apps-locally/SKILL.md',
                ),
            ),
        ).resolves.toBeUndefined();
        expect(
            await fs.readFile(
                path.join(appDir, '.lightdash/context/semantic-layer.yml'),
                'utf8',
            ),
        ).toBe('models: []\n');
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: `/api/v1/ee/projects/${PROJECT_UUID}/apps/authoring-context?slug=revenue-explorer`,
            body: undefined,
        });
        expect(LightdashAnalytics.track).toHaveBeenCalledWith({
            event: 'command.executed',
            properties: expect.objectContaining({
                command: 'create-app',
                success: true,
            }),
        });
        expect(GlobalState.log).toHaveBeenCalledWith(
            expect.stringContaining('react@19.2.5'),
        );
        expect(GlobalState.log).toHaveBeenCalledWith(
            expect.stringContaining('⚠ Local package installation'),
        );
        expect(GlobalState.log).toHaveBeenCalledWith(
            expect.stringContaining('shadcn@2.3.0'),
        );
        expect(promptMock).toHaveBeenCalledTimes(2);
        expect(promptMock).toHaveBeenNthCalledWith(1, [
            expect.objectContaining({
                type: 'confirm',
                name: 'confirmed',
                message: 'Continue and review the packages to be installed?',
                default: false,
            }),
        ]);
        expect(promptMock).toHaveBeenNthCalledWith(2, [
            expect.objectContaining({
                type: 'confirm',
                name: 'confirmed',
                message: 'Install these packages and create the app?',
                default: false,
            }),
        ]);
        expect(execaMock).toHaveBeenCalledWith('npm', ['--version']);
        expect(execaMock).toHaveBeenCalledWith(
            'npm',
            [
                'install',
                '--include=dev',
                '--ignore-scripts',
                '--no-package-lock',
            ],
            expect.objectContaining({
                cwd: expect.any(String),
                stdio: 'inherit',
            }),
        );
        expect(execaMock).toHaveBeenCalledWith(
            'npx',
            expect.arrayContaining(['shadcn@2.3.0', 'init']),
            expect.objectContaining({
                cwd: expect.any(String),
                input: '\u001B[B\n',
            }),
        );
        expect(execaMock).toHaveBeenCalledWith(
            'npx',
            expect.arrayContaining(['shadcn@2.3.0', 'add', 'button']),
            expect.objectContaining({
                cwd: expect.any(String),
                input: '\u001B[B\n',
            }),
        );
    });

    it('requires npm before requesting app context', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        execaMock.mockRejectedValueOnce(new Error('npm not found'));

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('npm is required to create a data app');
        expect(lightdashApi).not.toHaveBeenCalled();
        await expect(
            fs.access(path.join(root, 'apps', 'revenue-explorer')),
        ).rejects.toThrow();
    });

    it('does not create anything when package installation is declined', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        promptMock
            .mockResolvedValueOnce({ confirmed: true })
            .mockResolvedValueOnce({ confirmed: false });

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('Data app creation cancelled');
        expect(lightdashApi).not.toHaveBeenCalled();
        await expect(
            fs.access(path.join(root, 'apps', 'revenue-explorer')),
        ).rejects.toThrow();
    });

    it('does not list packages when local tooling approval is declined', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        promptMock.mockResolvedValueOnce({ confirmed: false });

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('Data app creation cancelled');
        expect(promptMock).toHaveBeenCalledTimes(1);
        expect(GlobalState.log).not.toHaveBeenCalledWith(
            expect.stringContaining('react@19.2.5'),
        );
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('requires explicit approval in non-interactive mode', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        vi.mocked(GlobalState.isNonInteractive).mockReturnValueOnce(true);

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('--assume-yes');
        expect(promptMock).not.toHaveBeenCalled();
    });

    it('accepts --assume-yes in non-interactive mode', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        vi.mocked(GlobalState.isNonInteractive).mockReturnValueOnce(true);

        await createAppHandler('Revenue Explorer', {
            assumeYes: true,
            path: root,
            verbose: false,
        });

        expect(promptMock).not.toHaveBeenCalled();
        await expect(
            fs.access(path.join(root, 'apps', 'revenue-explorer')),
        ).resolves.toBeUndefined();
    });

    it('cleans up the temporary app when installation fails', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        execaMock.mockImplementation(
            async (command: string, args: string[] = []) => {
                if (command === 'npm' && args[0] === 'install') {
                    throw new Error('registry unavailable');
                }
                return { stdout: '' };
            },
        );

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('registry unavailable');
        expect(await fs.readdir(path.join(root, 'apps'))).toEqual([]);
    });

    it('does not overwrite an existing app directory', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-create-app-'));
        const appDir = path.join(root, 'apps', 'revenue-explorer');
        await fs.mkdir(appDir, { recursive: true });
        await fs.writeFile(path.join(appDir, 'keep.txt'), 'keep');

        await expect(
            createAppHandler('Revenue Explorer', {
                path: root,
                verbose: false,
            }),
        ).rejects.toThrow('already exists');
        expect(await fs.readFile(path.join(appDir, 'keep.txt'), 'utf8')).toBe(
            'keep',
        );
    });
});
