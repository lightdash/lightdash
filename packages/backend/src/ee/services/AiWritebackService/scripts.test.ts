import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildGatherRepoContextScript } from './scripts';

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
