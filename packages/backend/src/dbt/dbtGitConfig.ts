import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

type DbtGitConfigArgs = {
    token: string;
    host: string;
    repositoryDirectory: string;
};

const isWithinDirectory = (parent: string, child: string): boolean => {
    const relativePath = path.relative(
        path.resolve(parent),
        path.resolve(child),
    );
    return (
        relativePath === '' ||
        (!relativePath.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relativePath))
    );
};

export const withDbtGitConfig = async <T>(
    { token, host, repositoryDirectory }: DbtGitConfigArgs,
    run: (configPath: string) => Promise<T>,
): Promise<T> => {
    const configDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'dbt_git_config_'),
    );

    try {
        if (isWithinDirectory(repositoryDirectory, configDirectory)) {
            throw new Error(
                'dbt git config directory must be outside the repo',
            );
        }

        await fs.chmod(configDirectory, 0o700);
        const configPath = path.join(configDirectory, 'config');
        await fs.writeFile(
            configPath,
            `[url "https://x-access-token:${token}@${host}/"]\n` +
                `    insteadOf = https://${host}/\n` +
                `    insteadOf = git@${host}:\n` +
                `    insteadOf = ssh://git@${host}/\n` +
                `[credential]\n` +
                `    helper =\n`,
            { mode: 0o600 },
        );

        return await run(configPath);
    } finally {
        await fs.rm(configDirectory, { recursive: true, force: true });
    }
};
