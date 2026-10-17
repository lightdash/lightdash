import { ParseError } from '@lightdash/common';
import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';

type DbtLoomEnvironmentArgs = {
    projectDirectory: string;
    targetPath: string;
    enabled: boolean;
    explicitCredentials: boolean;
    dbtEnvironment: Record<string, string>;
};

type DbtLoomManifest = {
    name: string;
    type: string;
    config: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const isInside = (root: string, candidate: string): boolean => {
    const relative = path.relative(root, candidate);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    );
};

const assertProjectPath = async (
    projectDirectory: string,
    candidate: string,
    label: string,
): Promise<void> => {
    if (!isInside(projectDirectory, candidate)) {
        throw new ParseError(
            `${label} must stay inside the dbt project directory.`,
        );
    }
    const [realRoot, realCandidate] = await Promise.all([
        fs.realpath(projectDirectory),
        fs.realpath(candidate).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return null;
            throw error;
        }),
    ]);
    if (realCandidate !== null && !isInside(realRoot, realCandidate)) {
        throw new ParseError(
            `${label} must stay inside the dbt project directory.`,
        );
    }
};

const requiredEnvironment = (
    manifest: DbtLoomManifest,
    environment: Record<string, string>,
    keys: string[],
): void => {
    if (keys.some((key) => !environment[key]?.trim())) {
        throw new ParseError(
            `dbt-loom manifest "${manifest.name}" uses type "${manifest.type}", which needs ${keys.join(' and ')} in the project's dbt environment variables.`,
        );
    }
};

const validateManifest = async (
    manifest: DbtLoomManifest,
    projectDirectory: string,
    environment: Record<string, string>,
): Promise<void> => {
    const { config } = manifest;
    const invalid = (detail: string): ParseError =>
        new ParseError(`dbt-loom manifest "${manifest.name}" ${detail}.`);
    switch (manifest.type) {
        case 'file': {
            if (typeof config.path !== 'string' || !config.path)
                throw invalid('needs a file path');
            if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(config.path)) {
                if (!config.path.startsWith('https://'))
                    throw invalid('needs an HTTPS file URL');
            } else {
                await assertProjectPath(
                    projectDirectory,
                    path.resolve(projectDirectory, config.path),
                    `dbt-loom manifest "${manifest.name}" file path`,
                );
            }
            return;
        }
        case 'dbt_cloud':
        case 'paradime':
            if (
                config.api_endpoint !== undefined &&
                (typeof config.api_endpoint !== 'string' ||
                    !config.api_endpoint.startsWith('https://'))
            ) {
                throw invalid('needs an HTTPS api_endpoint');
            }
            return;
        case 'snowflake':
            return;
        case 's3':
            requiredEnvironment(manifest, environment, [
                'AWS_ACCESS_KEY_ID',
                'AWS_SECRET_ACCESS_KEY',
            ]);
            return;
        case 'gcs':
            if (typeof config.credentials !== 'string' || !config.credentials)
                throw invalid('needs a credentials file');
            await assertProjectPath(
                projectDirectory,
                path.resolve(projectDirectory, config.credentials),
                `dbt-loom manifest "${manifest.name}" credentials`,
            );
            return;
        case 'azure':
            requiredEnvironment(manifest, environment, [
                'AZURE_TENANT_ID',
                'AZURE_CLIENT_ID',
                'AZURE_CLIENT_SECRET',
            ]);
            return;
        case 'databricks':
            requiredEnvironment(manifest, environment, [
                'DATABRICKS_HOST',
                'DATABRICKS_TOKEN',
            ]);
            return;
        default:
            throw invalid(`uses unsupported type "${manifest.type}"`);
    }
};

export const resolveDbtLoomEnvironment = async ({
    projectDirectory,
    targetPath,
    enabled,
    explicitCredentials,
    dbtEnvironment,
}: DbtLoomEnvironmentArgs): Promise<{ DBT_LOOM_CONFIG: string }> => {
    const disabledPath = path.join(targetPath, 'dbt-loom-disabled.yml');
    if (!enabled) return { DBT_LOOM_CONFIG: disabledPath };
    const configPath = path.resolve(
        projectDirectory,
        dbtEnvironment.DBT_LOOM_CONFIG || 'dbt_loom.config.yml',
    );
    if (explicitCredentials)
        await assertProjectPath(
            projectDirectory,
            configPath,
            'dbt-loom config path',
        );
    let source: string;
    try {
        source = await fs.readFile(configPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return { DBT_LOOM_CONFIG: disabledPath };
        throw error;
    }
    const substituted = source.replace(
        /\$(\w+)|\$\{([^}]+)\}/g,
        (_, simple: string | undefined, braced: string | undefined) =>
            dbtEnvironment[simple ?? braced ?? ''] ?? '',
    );
    let parsed: unknown;
    try {
        parsed = yaml.load(substituted);
    } catch (error) {
        throw new ParseError(
            `Invalid dbt-loom config YAML: ${(error as Error).message}`,
        );
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.manifests)) {
        throw new ParseError('dbt-loom config needs a manifests array.');
    }
    const manifests: DbtLoomManifest[] = parsed.manifests.map(
        (entry: unknown, index: number) => {
            if (
                !isRecord(entry) ||
                typeof entry.name !== 'string' ||
                !entry.name ||
                typeof entry.type !== 'string' ||
                !entry.type ||
                !isRecord(entry.config)
            ) {
                throw new ParseError(
                    `dbt-loom manifest entry ${index + 1} needs a name, type, and config object.`,
                );
            }
            return { name: entry.name, type: entry.type, config: entry.config };
        },
    );
    if (explicitCredentials) {
        await Promise.all(
            manifests.map((manifest) =>
                validateManifest(manifest, projectDirectory, dbtEnvironment),
            ),
        );
    }
    return { DBT_LOOM_CONFIG: configPath };
};
