import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const buildScript = readFileSync(
    path.resolve(__dirname, '../scripts/build-binaries.sh'),
    'utf8',
);
const checksumSection = buildScript.indexOf(
    '# Create checksums for all archives',
);
if (checksumSection === -1) throw new Error('Checksum section not found');

// Run the release script's checksum phase without rebuilding or signing binaries.
const checksumScript = `set -e
VERSION=v1
SIGN_AND_NOTARIZE=false
CREATE_ARCHIVES=true
TARGETS=''
if true; then
${buildScript.slice(checksumSection)}`;

describe('CLI binary archive checksums', () => {
    const directories: string[] = [];

    afterEach(() => {
        directories.splice(0).forEach((directory) => {
            rmSync(directory, { recursive: true, force: true });
        });
    });

    const fixture = (archives: string[]) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'cli-checksums-'));
        directories.push(directory);
        archives.forEach((archive) => {
            writeFileSync(
                path.join(directory, archive),
                `contents of ${archive}`,
            );
        });
        return directory;
    };

    const linux = 'lightdash-cli-v1-linux-x64.tar.gz';
    const macos = 'lightdash-cli-v1-macos-arm64.tar.gz';
    const windows = 'lightdash-cli-v1-win-x64.zip';

    it.each([
        { scenario: 'Linux only', archives: [linux] },
        { scenario: 'macOS only', archives: [macos] },
        { scenario: 'Windows only', archives: [windows] },
        { scenario: 'all platforms', archives: [macos, linux, windows] },
    ])('hashes every archive for $scenario', ({ archives }) => {
        const directory = fixture(archives);
        const result = spawnSync('bash', ['-c', checksumScript], {
            cwd: directory,
            encoding: 'utf8',
        });

        expect(result.status).toBe(0);
        const combined = readFileSync(
            path.join(directory, 'checksums-all-sha256.txt'),
            'utf8',
        );
        const expected = archives.map((archive) => {
            const hash = createHash('sha256')
                .update(readFileSync(path.join(directory, archive)))
                .digest('hex');
            return `${hash}  ${archive}`;
        });
        expect(combined.trim().split('\n').sort()).toEqual(expected.sort());
        expect(result.stderr).toBe('');

        const verification = spawnSync(
            'shasum',
            ['-a', '256', '-c', 'checksums-all-sha256.txt'],
            { cwd: directory, encoding: 'utf8' },
        );
        expect(verification.status).toBe(0);
    });

    it('does not create a checksum file or list unrelated files without archives', () => {
        const directory = fixture([]);
        writeFileSync(path.join(directory, 'unrelated-file'), 'not an archive');
        const result = spawnSync('bash', ['-c', checksumScript], {
            cwd: directory,
            encoding: 'utf8',
        });

        expect(result.status).toBe(0);
        expect(readdirSync(directory)).toEqual(['unrelated-file']);
        expect(result.stdout).not.toContain('unrelated-file');
        expect(result.stderr).toBe('');
    });

    it.each([
        { scenario: 'without output', partialOutput: false },
        { scenario: 'with partial output', partialOutput: true },
    ])('keeps checksum failures nonfatal $scenario', ({ partialOutput }) => {
        const directory = fixture([linux, windows]);
        const result = spawnSync(
            'bash',
            [
                '-c',
                `shasum() {
                    if [ "$#" -gt 3 ]; then
                        ${partialOutput ? "printf '%s\\n' partial-checksum" : ''}
                        return 23
                    fi
                    command shasum "$@"
                }
${checksumScript}`,
            ],
            { cwd: directory, encoding: 'utf8' },
        );

        expect(result.status).toBe(0);
        if (partialOutput) {
            expect(
                readFileSync(
                    path.join(directory, 'checksums-all-sha256.txt'),
                    'utf8',
                ),
            ).toBe('partial-checksum\n');
        } else {
            expect(readdirSync(directory)).not.toContain(
                'checksums-all-sha256.txt',
            );
            expect(result.stdout).not.toContain(
                'Created checksums-all-sha256.txt',
            );
        }
    });

    it('keeps distribution listing failures nonfatal', () => {
        const directory = fixture([linux, windows]);
        const result = spawnSync(
            'bash',
            [
                '-c',
                `ls() {
                    if [ "$1" = '-lah' ]; then return 17; fi
                    command ls "$@"
                }
${checksumScript}`,
            ],
            { cwd: directory, encoding: 'utf8' },
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Created checksums-all-sha256.txt');
    });

    it('keeps per-platform checksum failures fatal', () => {
        const directory = fixture([linux]);
        const result = spawnSync(
            'bash',
            ['-c', `shasum() { return 29; }\n${checksumScript}`],
            { cwd: directory, encoding: 'utf8' },
        );

        expect(result.status).toBe(29);
    });
});
