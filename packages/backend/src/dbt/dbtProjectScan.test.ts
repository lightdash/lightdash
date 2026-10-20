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
        expect(await scanDbtProject(directory)).toMatchObject({
            projectName: 'local',
            referencedProjects: ['upstream', 'other', 'comment_only'],
            installedPackages: [],
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
        expect(await scanDbtProject(directory)).toMatchObject({
            projectName: null,
            referencedProjects: [],
            installedPackages: [],
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
        expect(await scanDbtProject(directory)).toMatchObject({
            projectName: null,
            referencedProjects: [],
            installedPackages: [],
            declaredUpstreams: [],
        });
    });
});

it('reads installed project names rather than package directory names', async () => {
    await write('dbt_packages/leaf_a/dbt_project.yml', 'name: leaf_b');
    await write('dbt_packages/leaf_c/dbt_project.yml', 'name: [');
    expect((await scanDbtProject(directory)).installedPackages).toEqual([
        'leaf_b',
    ]);
});

it('scans versions, keyword packages and unique one-argument refs with local and package models', async () => {
    await write('dbt_project.yml', 'name: local');
    await write(
        'models/orders_v2.sql',
        "{{ ref('a', 'sales', v=2) }} {{ ref('a', 'sales', version='3') }} {{ ref('items', package='b', version=1) }} {{ ref('single') }} {{ ref('one', v=4) }} {{ ref('one', v=4) }}",
    );
    await write(
        'models/schema.yml',
        'models:\n  - name: catalogue\n    versions:\n      - v: 1',
    );
    await write('dbt_packages/pkg/dbt_project.yml', 'name: installed');
    await write('dbt_packages/pkg/models/package_model.sql', 'select 1');
    expect(await scanDbtProject(directory)).toMatchObject({
        refs: [
            { packageName: 'a', name: 'sales', version: '2' },
            { packageName: 'a', name: 'sales', version: '3' },
            { packageName: 'b', name: 'items', version: '1' },
            { packageName: null, name: 'single', version: null },
            { packageName: null, name: 'one', version: '4' },
        ],
        localModels: ['catalogue', 'orders'],
        installedPackageModels: ['package_model'],
        installedPackages: ['installed'],
    });
});

it('reads the configured package path and skips package refs in that directory', async () => {
    await write(
        'dbt_project.yml',
        'name: leaf_a\npackages-install-path: vendor',
    );
    await write('vendor/leaf_b/dbt_project.yml', 'name: leaf_c');
    await write(
        'vendor/leaf_b/models/leaf_b.sql',
        "{{ ref('leaf_d', 'leaf_e') }}",
    );
    await write('models/leaf_a.sql', "{{ ref('leaf_c', 'leaf_e') }}");
    expect(await scanDbtProject(directory)).toEqual({
        projectName: 'leaf_a',
        installedPackages: ['leaf_c'],
        installedPackageModels: ['leaf_b'],
        localModels: ['leaf_a'],
        refs: [{ packageName: 'leaf_c', name: 'leaf_e', version: null }],
        referencedProjects: ['leaf_c'],
        declaredUpstreams: [],
    });
});

it('uses configured model paths for SQL, Python and schema models in each project', async () => {
    await write(
        'dbt_project.yml',
        'name: c\nmodel-paths: [transformations, python_models]',
    );
    await write('transformations/m_v2.sql', "{{ ref('p', 'm', v=2.0) }}");
    await write(
        'python_models/py_model.py',
        'def model(dbt, session): return dbt.ref("p", "m", version="2")',
    );
    await write(
        'transformations/schema.yml',
        'models:\n  - name: schema_model',
    );
    await write('models/ignored.sql', 'select 1');
    await write('analysis/models/ignored.py', 'pass');
    await write(
        'dbt_packages/x/dbt_project.yml',
        'name: x\nmodel-paths: [src]',
    );
    await write('dbt_packages/x/src/package_v2.py', 'pass');
    expect(await scanDbtProject(directory)).toMatchObject({
        localModels: ['m', 'py_model', 'schema_model'],
        installedPackageModels: ['package'],
        refs: [{ packageName: 'p', name: 'm', version: '2' }],
    });
});

it('includes Python models in the default model path', async () => {
    await write('models/py_v2.py', 'pass');
    expect((await scanDbtProject(directory)).localModels).toEqual(['py']);
});
