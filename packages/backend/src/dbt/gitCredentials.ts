import fs from 'fs';
import os from 'os';
import path from 'path';

const quoteGitConfigValue = (value: string): string =>
    `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export type GitCredentialFiles = {
    directory: string;
    configPath: string;
};

export const createGithubGitCredentialFiles = ({
    host,
    token,
}: {
    host: string;
    token: string;
}): GitCredentialFiles => {
    const origin = new URL(`https://${host}`);
    if (origin.pathname !== '/' || origin.search || origin.hash) {
        throw new Error('GitHub host domain must not include a path');
    }

    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'github_credentials_'),
    );
    const credentialsPath = path.join(directory, 'credentials');
    const configPath = path.join(directory, 'gitconfig');
    const credentialUrl = new URL(origin);
    credentialUrl.username = 'lightdash';
    credentialUrl.password = token;

    fs.writeFileSync(credentialsPath, `${credentialUrl.href}\n`, {
        mode: 0o600,
    });
    fs.writeFileSync(
        configPath,
        [
            '[credential]',
            '    helper =',
            `[credential ${quoteGitConfigValue(origin.origin)}]`,
            `    helper = ${quoteGitConfigValue(
                `store --file=${credentialsPath}`,
            )}`,
            '    username = lightdash',
            `[url ${quoteGitConfigValue(`${origin.origin}/`)}]`,
            `    insteadOf = ${quoteGitConfigValue(`git@${origin.host}:`)}`,
            `    insteadOf = ${quoteGitConfigValue(
                `ssh://git@${origin.host}/`,
            )}`,
            '',
        ].join('\n'),
        { mode: 0o600 },
    );

    return { directory, configPath };
};
