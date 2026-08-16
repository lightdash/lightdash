import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { withDbtGitConfig } from './dbtGitConfig';

describe('withDbtGitConfig', () => {
    let repositoryDirectory: string;

    beforeEach(async () => {
        repositoryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt_repository_'),
        );
    });

    afterEach(async () => {
        await fs.rm(repositoryDirectory, { recursive: true, force: true });
    });

    it('provides an isolated config that authenticates every GitHub URL form', async () => {
        const token = 'github-installation-token';

        await withDbtGitConfig(
            {
                token,
                host: 'github.com',
                repositoryDirectory,
            },
            async (configPath) => {
                const configDirectory = path.dirname(configPath);
                const config = await fs.readFile(configPath, 'utf8');
                const directoryStats = await fs.stat(configDirectory);

                expect(config).toEqual(
                    `[url "https://x-access-token:${token}@github.com/"]\n` +
                        `    insteadOf = https://github.com/\n` +
                        `    insteadOf = git@github.com:\n` +
                        `    insteadOf = ssh://git@github.com/\n` +
                        `[credential]\n` +
                        `    helper =\n`,
                );
                expect(directoryStats.mode % 0o1000).toBe(0o700);
                expect(
                    path.relative(repositoryDirectory, configDirectory),
                ).toMatch(/^\.\./);
            },
        );
    });

    it('does not rewrite userinfo-bearing DBT_ENV_SECRET package URLs', async () => {
        const token = 'github-installation-token';
        const host = 'github.example.com';

        await withDbtGitConfig(
            {
                token,
                host,
                repositoryDirectory,
            },
            async (configPath) => {
                const env = {
                    ...process.env,
                    GIT_CONFIG_GLOBAL: configPath,
                    GIT_CONFIG_NOSYSTEM: '1',
                };
                const ordinaryUrl = `https://${host}/org/package.git`;
                const dbtEnvironmentSecretUrl = `https://dbt-environment-secret@${host}/org/package.git`;

                const ordinaryResult = await execa(
                    'git',
                    ['ls-remote', '--get-url', ordinaryUrl],
                    { env },
                );
                const dbtEnvironmentSecretResult = await execa(
                    'git',
                    ['ls-remote', '--get-url', dbtEnvironmentSecretUrl],
                    { env },
                );

                expect(ordinaryResult.stdout).toBe(
                    `https://x-access-token:${token}@${host}/org/package.git`,
                );
                expect(dbtEnvironmentSecretResult.stdout).toBe(
                    dbtEnvironmentSecretUrl,
                );
            },
        );
    });
});
