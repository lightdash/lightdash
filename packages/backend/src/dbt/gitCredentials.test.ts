import execa from 'execa';
import fs from 'fs/promises';
import { createGithubGitCredentialFiles } from './gitCredentials';

describe('createGithubGitCredentialFiles', () => {
    it('creates scoped credentials and rewrites SSH GitHub URLs to HTTPS', async () => {
        const token = 'ghs_test-token';
        const files = createGithubGitCredentialFiles({
            host: 'github.example.com',
            token,
        });

        try {
            const config = await fs.readFile(files.configPath, 'utf8');
            const credentialsPath = `${files.directory}/credentials`;
            const credentials = await fs.readFile(credentialsPath, 'utf8');
            const configMode = (await fs.stat(files.configPath)).mode % 0o1000;
            const credentialsMode =
                (await fs.stat(credentialsPath)).mode % 0o1000;

            expect(config).toContain('insteadOf = "git@github.example.com:"');
            expect(config).toContain(
                'insteadOf = "ssh://git@github.example.com/"',
            );
            expect(config).not.toContain(token);
            expect(credentials).toEqual(
                'https://lightdash:ghs_test-token@github.example.com/\n',
            );
            expect(configMode).toEqual(0o600);
            expect(credentialsMode).toEqual(0o600);

            const result = await execa('git', ['credential', 'fill'], {
                env: { GIT_CONFIG_GLOBAL: files.configPath },
                extendEnv: true,
                input: ['protocol=https', 'host=github.example.com', ''].join(
                    '\n',
                ),
            });

            expect(result.stdout).toContain('username=lightdash');
            expect(result.stdout).toContain(`password=${token}`);
        } finally {
            await fs.rm(files.directory, { recursive: true, force: true });
        }
    });

    it('rejects a host with a path', () => {
        expect(() =>
            createGithubGitCredentialFiles({
                host: 'github.example.com/attacker',
                token: 'ghs_test-token',
            }),
        ).toThrow('GitHub host domain must not include a path');
    });
});
