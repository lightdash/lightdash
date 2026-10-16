import {
    DbtError,
    SupportedDbtVersions,
    type DbtExternalModelNode,
    type DbtRawModelNode,
} from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import path from 'path';
import { DbtCliClient } from './dbtCliClient';
import {
    cliArgs as cliArgsWithoutVersion,
    cliMockImplementation,
    expectedCommandOptions,
    expectedDbtOptions,
    expectedPackages,
    manifestMock,
    packagesYml,
} from './dbtCliClient.mock';

const execaMock = execa as unknown as import('vitest').Mock;

vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
}));
vi.mock('execa');

Object.values(SupportedDbtVersions).map((dbtVersion) => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion,
    };
    return describe(`DbtCliClient ${dbtVersion}`, () => {
        beforeEach(() => {
            vi.resetAllMocks();
            vi.mocked(fs.mkdtemp).mockResolvedValue(
                '/tmp/dbt_target_test' as never,
            );
        });
        it('should install dependencies with success', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.success);

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.installDeps()).resolves.toEqual(undefined);
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [...expectedDbtOptions, 'deps', ...expectedCommandOptions],
                expect.anything(),
            );
        });
        it('should error on install dependencies', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.error);

            const client = new DbtCliClient(cliArgs);

            await expect(client.installDeps()).rejects.toThrowError(DbtError);
        });
        it('should get manifest with success', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.success);
            vi.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
                JSON.stringify(manifestMock),
            );

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.getDbtManifest()).resolves.toEqual({
                manifest: manifestMock,
            });
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [
                    ...expectedDbtOptions,
                    'ls',
                    '--output',
                    'json',
                    '--output-keys',
                    'unique_id',
                    ...expectedCommandOptions,
                ],
                expect.anything(),
            );
        });
        it('should get packages with success', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(
                async () => packagesYml,
            );

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toEqual(
                expectedPackages,
            );
        });
        it('should ignore error when packages.yml doesnt exist', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(() => {
                throw new Error('file not found');
            });

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toBeUndefined();
        });
    });
});

// Pinned to one dbt version: the environment is version independent, and the
// matrix above would repeat these nine times for nothing.
describe('DbtCliClient environment', () => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion: SupportedDbtVersions.V1_10,
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.mkdtemp).mockResolvedValue(
            '/tmp/dbt_target_test' as never,
        );
        execaMock.mockImplementation(cliMockImplementation.success);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('does not extend the backend environment', async () => {
        await new DbtCliClient(cliArgs).installDeps();
        const [, , options] = execaMock.mock.calls[0];

        expect(options).toMatchObject({ extendEnv: false });
    });

    it('runs dbt from the project directory', async () => {
        await new DbtCliClient(cliArgs).installDeps();
        const [, , options] = execaMock.mock.calls[0];

        expect(options).toMatchObject({ cwd: cliArgs.dbtProjectDirectory });
    });

    it('resolves relative directories before changing the cwd', async () => {
        await new DbtCliClient({
            ...cliArgs,
            dbtProjectDirectory: 'relative/project',
            dbtProfilesDirectory: 'relative/profiles',
        }).installDeps();
        const [, args, options] = execaMock.mock.calls[0];

        expect(options).toMatchObject({
            cwd: path.resolve('relative/project'),
        });
        expect(args).toEqual(
            expect.arrayContaining([
                path.resolve('relative/project'),
                path.resolve('relative/profiles'),
            ]),
        );
    });

    it('does not hand backend secrets to dbt', async () => {
        vi.stubEnv('LIGHTDASH_SECRET', 'not-for-dbt');
        vi.stubEnv('PATH', '/usr/local/bin');

        await new DbtCliClient(cliArgs).installDeps();
        const [, , options] = execaMock.mock.calls[0];
        const { env } = options as { env: Record<string, string> };

        expect(env).not.toHaveProperty('LIGHTDASH_SECRET');
        expect(Object.values(env)).not.toContain('not-for-dbt');
        expect(env.PATH).toEqual('/usr/local/bin');
    });

    it('hands allowlisted machine variables to dbt', async () => {
        vi.stubEnv('UTILS_PII_SALT', 'machine-owned-salt');

        await new DbtCliClient({
            ...cliArgs,
            environmentVariableAllowlist: ['UTILS_PII_SALT'],
        }).installDeps();
        const [, , options] = execaMock.mock.calls[0];

        expect((options as { env: Record<string, string> }).env).toMatchObject({
            UTILS_PII_SALT: 'machine-owned-salt',
        });
    });

    it('keeps explicit credentials while removing inherited and allowlisted host credentials', async () => {
        vi.stubEnv('AWS_ACCESS_KEY_ID', 'host-key');
        vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'host-secret');
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/host/adc.json');
        await new DbtCliClient({
            ...cliArgs,
            explicitCredentials: true,
            environmentVariableAllowlist: ['GOOGLE_APPLICATION_CREDENTIALS'],
            environment: {
                AWS_ACCESS_KEY_ID: 'target-key',
                AWS_SECRET_ACCESS_KEY: 'target-secret',
                PROJECT_SETTING: 'explicit',
            },
        }).installDeps();
        const [, , options] = execaMock.mock.calls[0];
        const { env } = options as { env: Record<string, string> };
        expect(env).toMatchObject({
            AWS_ACCESS_KEY_ID: 'target-key',
            AWS_SECRET_ACCESS_KEY: 'target-secret',
            PROJECT_SETTING: 'explicit',
        });
        expect(env).not.toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
        expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
            '/host/adc.json',
        );
    });

    it('passes the scoped git config to dbt without exposing a token', async () => {
        await new DbtCliClient({
            ...cliArgs,
            gitConfigGlobalPath: '/tmp/lightdash-gitconfig',
        }).installDeps();
        const [, , options] = execaMock.mock.calls[0];
        const { env } = options as { env: Record<string, string> };

        expect(env.GIT_CONFIG_GLOBAL).toEqual('/tmp/lightdash-gitconfig');
        expect(env.GIT_TERMINAL_PROMPT).toEqual('0');
        expect(Object.values(env)).not.toContain('ghs_private-token');
    });

    it('adds the GitHub App installation hint to dbt deps errors', async () => {
        execaMock.mockImplementationOnce(cliMockImplementation.error);

        await expect(
            new DbtCliClient({
                ...cliArgs,
                dbtDepsErrorHint:
                    'Ensure the package is in the same GitHub App installation.',
            }).installDeps(),
        ).rejects.toThrow(
            'Ensure the package is in the same GitHub App installation.',
        );
    });

    it('cannot be pointed at another target directory by a project', async () => {
        await new DbtCliClient({
            ...cliArgs,
            environment: { DBT_TARGET_PATH: '/tmp/attacker' },
        }).installDeps();
        const [, , options] = execaMock.mock.calls[0];

        expect((options as { env: Record<string, string> }).env).toMatchObject({
            DBT_TARGET_PATH: '/tmp/dbt_target_test',
        });
    });
});

describe('DbtCliClient external model nodes', () => {
    const externalNode: DbtExternalModelNode = {
        name: 'orders',
        package_name: 'shared',
        identifier: 'orders',
        schema: 'public',
        database: 'db',
        relation_name: null,
        version: null,
        latest_version: null,
        access: null,
        depends_on_nodes: [],
    };
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/dbt_target_test');
        execaMock.mockResolvedValue({
            stdout: '{"unique_id":"model.shared.orders"}\n{"unique_id":"model.analytics.orders"}',
            all: '',
        });
        vi.mocked(fs.readFile).mockResolvedValue(
            JSON.stringify({
                ...manifestMock,
                nodes: {
                    'model.shared.orders': {
                        resource_type: 'model',
                        path: '',
                        original_file_path: '',
                    } as DbtRawModelNode,
                    'model.analytics.orders': {
                        resource_type: 'model',
                        path: 'orders.sql',
                        original_file_path: 'models/orders.sql',
                    } as DbtRawModelNode,
                },
            }),
        );
    });
    it('writes the plugin, passes controlled paths and removes external selections', async () => {
        const client = new DbtCliClient({
            ...cliArgsWithoutVersion,
            dbtVersion: SupportedDbtVersions.V1_7,
            selector: 'package:analytics,tag:lightdash',
            environment: {
                PYTHONPATH: '/project',
                LIGHTDASH_DBT_EXTERNAL_NODES: '/project.json',
            },
        });
        const fetched = await client.getDbtManifest({
            externalNodes: [externalNode],
        });
        expect(fs.writeFile).toHaveBeenCalledWith(
            '/tmp/dbt_target_test/dbt_external_nodes/external_nodes.json',
            JSON.stringify([externalNode]),
            'utf8',
        );
        expect(execaMock.mock.calls[0][2].env).toMatchObject({
            PYTHONPATH: '/tmp/dbt_target_test/dbt_external_nodes',
            LIGHTDASH_DBT_EXTERNAL_NODES:
                '/tmp/dbt_target_test/dbt_external_nodes/external_nodes.json',
        });
        expect(fetched.selectedModelIds).toEqual(['model.analytics.orders']);
        await client.cleanup();
        expect(fs.rm).toHaveBeenCalledWith('/tmp/dbt_target_test', {
            recursive: true,
            force: true,
        });
    });
    it.each([SupportedDbtVersions.V1_4, SupportedDbtVersions.V1_5])(
        'rejects managed external nodes on %s',
        async (dbtVersion) => {
            await expect(
                new DbtCliClient({
                    ...cliArgsWithoutVersion,
                    dbtVersion,
                }).getDbtManifest({ externalNodes: [externalNode] }),
            ).rejects.toThrow(
                'Cross-source dbt refs require dbt 1.6 or newer.',
            );
            expect(execaMock).not.toHaveBeenCalled();
        },
    );
    it('does not create a plugin without external nodes', async () => {
        await new DbtCliClient({
            ...cliArgsWithoutVersion,
            dbtVersion: SupportedDbtVersions.V1_5,
        }).getDbtManifest({ externalNodes: [] });
        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(execaMock.mock.calls[0][2].env).not.toHaveProperty('PYTHONPATH');
    });
});
