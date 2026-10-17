import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { resolveDbtLoomEnvironment } from './dbtLoomConfig';

describe('resolveDbtLoomEnvironment', () => {
    let projectDirectory: string;
    let outsideDirectory: string;
    let targetPath: string;
    let args: Parameters<typeof resolveDbtLoomEnvironment>[0];

    beforeEach(async () => {
        projectDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-loom-project-'),
        );
        outsideDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-loom-outside-'),
        );
        targetPath = path.join(projectDirectory, 'target');
        args = {
            projectDirectory,
            targetPath,
            enabled: true,
            explicitCredentials: true,
            dbtEnvironment: {},
        };
    });
    afterEach(async () => {
        await fs.rm(projectDirectory, { recursive: true, force: true });
        await fs.rm(outsideDirectory, { recursive: true, force: true });
    });
    const writeConfig = async (directory: string, contents: string) => {
        await fs.writeFile(
            path.join(directory, 'dbt_loom.config.yml'),
            contents,
        );
    };
    const manifest = (type: string, config: string) =>
        `manifests:\n  - name: upstream\n    type: ${type}\n    config:\n${config}`;

    it('uses an absent path when disabled or no config exists', async () => {
        expect(
            (await resolveDbtLoomEnvironment({ ...args, enabled: false }))
                .DBT_LOOM_CONFIG,
        ).toBe(path.join(targetPath, 'dbt-loom-disabled.yml'));
        expect((await resolveDbtLoomEnvironment(args)).DBT_LOOM_CONFIG).toBe(
            path.join(targetPath, 'dbt-loom-disabled.yml'),
        );
    });
    it('accepts a repository file and an HTTPS URL', async () => {
        await fs.writeFile(path.join(projectDirectory, 'manifest.json'), '{}');
        await writeConfig(
            projectDirectory,
            manifest('file', '      path: manifest.json\n'),
        );
        expect((await resolveDbtLoomEnvironment(args)).DBT_LOOM_CONFIG).toBe(
            path.join(projectDirectory, 'dbt_loom.config.yml'),
        );
        await writeConfig(
            projectDirectory,
            manifest('file', '      path: https://example.com/manifest.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).resolves.toMatchObject({
            DBT_LOOM_CONFIG: path.join(projectDirectory, 'dbt_loom.config.yml'),
        });
    });
    it('rejects a file path escape only with explicit credentials', async () => {
        await writeConfig(
            projectDirectory,
            manifest('file', '      path: ../outside.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'must stay inside',
        );
        await expect(
            resolveDbtLoomEnvironment({ ...args, explicitCredentials: false }),
        ).resolves.toBeDefined();
    });
    it('rejects a symlink escape', async () => {
        await fs.writeFile(path.join(outsideDirectory, 'manifest.json'), '{}');
        await fs.symlink(
            path.join(outsideDirectory, 'manifest.json'),
            path.join(projectDirectory, 'manifest.json'),
        );
        await writeConfig(
            projectDirectory,
            manifest('file', '      path: manifest.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'must stay inside',
        );
    });
    it('rejects a symlinked config outside the project', async () => {
        const externalConfig = path.join(outsideDirectory, 'config.yml');
        await fs.writeFile(
            externalConfig,
            manifest('snowflake', '      name: example\n'),
        );
        await fs.symlink(
            externalConfig,
            path.join(projectDirectory, 'dbt_loom.config.yml'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'must stay inside',
        );
    });
    it('rejects HTTP file URLs', async () => {
        await writeConfig(
            projectDirectory,
            manifest('file', '      path: http://example.com/manifest.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow('HTTPS');
    });
    it.each(['$PATH_PART', '${PATH_PART}'])(
        'substitutes %s before validation',
        async (variable) => {
            await writeConfig(
                projectDirectory,
                manifest('file', `      path: ${variable}\n`),
            );
            await expect(
                resolveDbtLoomEnvironment({
                    ...args,
                    dbtEnvironment: { PATH_PART: '../outside.json' },
                }),
            ).rejects.toThrow('must stay inside');
        },
    );
    it('requires explicit S3 credentials', async () => {
        await writeConfig(
            projectDirectory,
            manifest('s3', '      bucket: example\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
        );
        await expect(
            resolveDbtLoomEnvironment({
                ...args,
                dbtEnvironment: {
                    AWS_ACCESS_KEY_ID: 'id',
                    AWS_SECRET_ACCESS_KEY: 'secret',
                },
            }),
        ).resolves.toBeDefined();
    });
    it('keeps GCS credentials inside the project', async () => {
        await writeConfig(
            projectDirectory,
            manifest('gcs', '      credentials: ../key.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'must stay inside',
        );
        await writeConfig(
            projectDirectory,
            manifest('gcs', '      credentials: key.json\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).resolves.toBeDefined();
    });
    it.each([
        [
            'azure',
            ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'],
        ],
        ['databricks', ['DATABRICKS_HOST', 'DATABRICKS_TOKEN']],
    ])('requires %s credentials', async (type, keys) => {
        await writeConfig(
            projectDirectory,
            manifest(type, '      name: example\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            keys.join(' and '),
        );
        await expect(
            resolveDbtLoomEnvironment({
                ...args,
                dbtEnvironment: Object.fromEntries(
                    keys.map((key) => [key, 'value']),
                ),
            }),
        ).resolves.toBeDefined();
    });
    it('rejects HTTP API endpoints', async () => {
        await writeConfig(
            projectDirectory,
            manifest('dbt_cloud', '      api_endpoint: http://example.com\n'),
        );
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow('HTTPS');
    });
    it('reports malformed YAML and manifest entries', async () => {
        await writeConfig(projectDirectory, 'manifests: [broken');
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'Invalid dbt-loom config YAML',
        );
        await writeConfig(projectDirectory, 'manifests:\n  - name: broken\n');
        await expect(resolveDbtLoomEnvironment(args)).rejects.toThrow(
            'manifest entry 1',
        );
    });
    it('honors a project-set config path and rejects config escapes', async () => {
        const configPath = path.join(projectDirectory, 'custom.yml');
        await fs.writeFile(
            configPath,
            manifest('snowflake', '      name: example\n'),
        );
        expect(
            (
                await resolveDbtLoomEnvironment({
                    ...args,
                    dbtEnvironment: { DBT_LOOM_CONFIG: 'custom.yml' },
                })
            ).DBT_LOOM_CONFIG,
        ).toBe(configPath);
        await expect(
            resolveDbtLoomEnvironment({
                ...args,
                dbtEnvironment: {
                    DBT_LOOM_CONFIG: path.join(outsideDirectory, 'config.yml'),
                },
            }),
        ).rejects.toThrow('must stay inside');
    });
});
