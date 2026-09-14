import fs from 'fs';
import os from 'os';
import path from 'path';

const quoteGitConfigValue = (value: string): string =>
    `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export type GitCredentialFiles = {
    directory: string;
    configPath: string;
};

export const createGitCredentialFiles = ({
    host,
    token,
    username,
}: {
    host: string;
    token: string;
    username: string;
}): GitCredentialFiles => {
    const origin = new URL(`https://${host}`);
    if (origin.pathname !== '/' || origin.search || origin.hash) {
        throw new Error('Git host domain must not include a path');
    }

    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'git_credentials_'),
    );
    const credentialsPath = path.join(directory, 'credentials');
    const configPath = path.join(directory, 'gitconfig');
    const credentialUrl = new URL(origin);
    credentialUrl.username = username;
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
            `    username = ${quoteGitConfigValue(username)}`,
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

export const createGithubGitCredentialFiles = (args: {
    host: string;
    token: string;
}): GitCredentialFiles =>
    createGitCredentialFiles({ ...args, username: 'lightdash' });
