import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const downloadDocs = async (
    revision,
    token,
    destination,
    request = fetch,
) => {
    if (!/^[a-f0-9]{40}$/.test(revision)) {
        throw new Error('Docs revision must be a 40-character commit SHA');
    }
    if (!token.trim()) throw new Error('Docs read token is empty');

    let response;
    try {
        response = await request(
            `https://api.github.com/repos/lightdash/mintlify-docs/tarball/${revision}`,
            {
                headers: {
                    Authorization: `Bearer ${token.trim()}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                signal: AbortSignal.timeout(120_000),
            },
        );
    } catch {
        throw new Error('Docs archive download failed');
    }
    if (!response.ok) {
        throw new Error(
            `Docs archive download failed (HTTP ${response.status})`,
        );
    }
    let archive;
    try {
        archive = Buffer.from(await response.arrayBuffer());
    } catch {
        throw new Error('Docs archive download failed');
    }
    try {
        execFileSync(
            'tar',
            ['-xz', '--strip-components=1', '-C', destination],
            {
                input: archive,
                stdio: ['pipe', 'ignore', 'pipe'],
            },
        );
    } catch {
        throw new Error('Docs archive extraction failed');
    }
};

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
    try {
        const [revision, secretFile, destination] = process.argv.slice(2);
        await downloadDocs(
            revision,
            readFileSync(secretFile, 'utf8'),
            destination,
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
