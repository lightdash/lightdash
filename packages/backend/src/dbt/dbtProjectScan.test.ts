import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { scanDbtProject } from './dbtProjectScan';

let directory: string;
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-scan-'));
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
const write = async (filename: string, content: string) => {
    await fs.mkdir(path.dirname(path.join(directory, filename)), {
        recursive: true,
    });
    await fs.writeFile(path.join(directory, filename), content);
};

describe('scanDbtProject', () => {
    it('finds both literal ref forms in sql and yaml, including Jinja comments as hints', async () => {
        await write('dbt_project.yml', 'name: local');
        await write(
            'models/a.sql',
            `{{ ref('upstream', 'orders') }} {{ ref("orders", package="other") }} {{ ref('upstream', 'again') }} {{ ref('local', 'local') }}`,
        );
        await write(
            'models/schema.yaml',
            `{# ref('comment_only', 'orders') #}`,
        );
        await write(
            'models/dynamic.sql',
            `{{ ref(var('project'), 'orders') }} {{ ref('dynamic', model) }}`,
        );
        expect(await scanDbtProject(directory)).toEqual({
            projectName: 'local',
            referencedProjects: ['upstream', 'other', 'comment_only'],
            declaredUpstreams: [],
            referencesOwnProject: true,
        });
    });
    it('skips generated directories, symlinks and files over 2 MB', async () => {
        await Promise.all(
            ['target', 'dbt_packages', 'logs'].map((folder) =>
                write(`${folder}/a.sql`, `ref('ignored', 'model')`),
            ),
        );
        await write(
            'large.sql',
            `ref('large', 'model')${' '.repeat(2 * 1024 * 1024)}`,
        );
        await fs.symlink(directory, path.join(directory, 'loop'));
        expect(await scanDbtProject(directory)).toEqual({
            projectName: null,
            referencedProjects: [],
            declaredUpstreams: [],
        });
    });
    it('reads distinct declared projects from dependencies.yml', async () => {
        await write('dbt_project.yml', 'name: consumer');
        await write(
            'dependencies.yml',
            'projects:\n  - name: upstream\n  - name: upstream\n  - invalid: ignored\n  - name: other',
        );
        expect((await scanDbtProject(directory)).declaredUpstreams).toEqual([
            'upstream',
            'other',
        ]);
    });
    it('tolerates missing, malformed and unreadable project files', async () => {
        expect(
            (await scanDbtProject(path.join(directory, 'absent'))).projectName,
        ).toBeNull();
        await write('dbt_project.yml', 'name: [');
        await write('dependencies.yml', 'projects: [');
        expect(await scanDbtProject(directory)).toEqual({
            projectName: null,
            referencedProjects: [],
            declaredUpstreams: [],
        });
    });
});
