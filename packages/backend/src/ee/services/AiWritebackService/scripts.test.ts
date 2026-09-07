import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDbtParseCommand, buildGatherRepoContextScript } from './scripts';

describe('buildGatherRepoContextScript', () => {
    const temporaryDirectories: string[] = [];

    afterEach(() => {
        temporaryDirectories.forEach((directory) =>
            rmSync(directory, { recursive: true, force: true }),
        );
        temporaryDirectories.length = 0;
    });

    it.each(['dbt/$(printf evaluated)', "dbt/team's models"])(
        'treats the project subpath %s as a literal shell argument',
        (projectSubPath) => {
            const repository = mkdtempSync(join(tmpdir(), 'ai-writeback-'));
            temporaryDirectories.push(repository);
            const projectDirectory = join(repository, projectSubPath);
            mkdirSync(projectDirectory, { recursive: true });
            writeFileSync(join(projectDirectory, 'model.sql'), 'select 1');

            const output = execFileSync(
                'bash',
                ['-c', buildGatherRepoContextScript(projectSubPath)],
                {
                    cwd: repository,
                    encoding: 'utf8',
                    env: { ...process.env, CDPATH: '' },
                },
            );

            expect(output.trim()).toBe('./model.sql');
        },
    );
});

describe('buildDbtParseCommand', () => {
    const command = buildDbtParseCommand({
        dbtBin: '/usr/local/dbt1.9/bin',
        projectDir: "/home/user/repo/team's dbt",
        profilesDir: '/tmp/ld-profiles',
    });

    it('pins dbt to the project version venv and points at the staged profiles', () => {
        expect(command).toContain(
            'PATH="/usr/local/dbt1.9/bin:$PATH" dbt parse',
        );
        expect(command).toContain(
            "--project-dir '/home/user/repo/team'\"'\"'s dbt'",
        );
        expect(command).toContain("--profiles-dir '/tmp/ld-profiles'");
    });

    // A parse runs dbt over customer models, so it must not carry secrets a
    // Jinja `env_var(...)` could read — the same property the compile wrapper has.
    it('strips secrets from the parse environment', () => {
        expect(command).toContain('-u ANTHROPIC_API_KEY');
        expect(command).toContain('-u GITHUB_TOKEN');
    });
});
