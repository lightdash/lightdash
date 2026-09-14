import { execFileSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildNativeSnapshotScript } from './nativeValidation';
import { buildGatherRepoContextScript } from './scripts';

describe('buildGatherRepoContextScript', () => {
    const temporaryDirectories: string[] = [];

    afterEach(() => {
        temporaryDirectories.forEach((directory) =>
            rmSync(directory, { recursive: true, force: true }),
        );
        temporaryDirectories.length = 0;
    });

    it('collects only native sources and config from a literal project subpath', () => {
        const repository = mkdtempSync(join(tmpdir(), 'native-snapshot-'));
        temporaryDirectories.push(repository);
        const subpath = "native/team's $(ignored)";
        const project = join(repository, subpath);
        mkdirSync(join(project, 'lightdash/models/nested'), {
            recursive: true,
        });
        writeFileSync(
            join(project, 'lightdash/models/nested/orders.yaml'),
            'native model',
        );
        writeFileSync(join(project, 'lightdash.config.yml'), 'native config');
        writeFileSync(join(project, '.env'), 'must never leave sandbox');
        const output = execFileSync(
            process.execPath,
            ['-e', buildNativeSnapshotScript(subpath)],
            { cwd: repository, encoding: 'utf8' },
        );
        expect(JSON.parse(output)).toEqual({
            'lightdash/models/nested/orders.yaml': 'native model',
            'lightdash.config.yml': 'native config',
        });
    });

    it('rejects a models directory escaping the connected project through a symlink', () => {
        const repository = mkdtempSync(join(tmpdir(), 'native-snapshot-'));
        temporaryDirectories.push(repository);
        mkdirSync(join(repository, 'native'));
        mkdirSync(join(repository, 'outside'));
        writeFileSync(
            join(repository, 'outside/private.yml'),
            'must not be read',
        );
        symlinkSync(
            join(repository, 'outside'),
            join(repository, 'native/models'),
        );
        expect(() =>
            execFileSync(
                process.execPath,
                ['-e', buildNativeSnapshotScript('native')],
                { cwd: repository, stdio: 'pipe' },
            ),
        ).toThrow(/Native source must stay inside/);
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
