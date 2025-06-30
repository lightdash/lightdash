import {
    DbtModelNode,
    getCompiledModels,
    getErrorMessage,
    getModelsFromManifest,
    ParseError,
    SupportedDbtVersions,
} from '@lightdash/common';
import execa from 'execa';
import { xor } from 'lodash';
import { loadManifest, LoadManifestArgs } from '../../dbt/manifest';
import GlobalState from '../../globalState';
import { getDbtVersion } from './getDbtVersion';

export type DbtCompileOptions = {
    profilesDir: string | undefined;
    projectDir: string | undefined;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
    models: string[] | undefined;
    vars: string | undefined;
    threads: string | undefined;
    noVersionCheck: boolean | undefined;
    exclude: string[] | undefined;
    selector: string | undefined;
    state: string | undefined;
    fullRefresh: boolean | undefined;
    skipDbtCompile: boolean | undefined;
    skipWarehouseCatalog: boolean | undefined;
    useDbtList: boolean | undefined;
    defer: boolean | undefined;
};

const dbtCompileArgs = [
    'profilesDir',
    'projectDir',
    'target',
    'profile',
    'select',
    'models',
    'vars',
    'threads',
    'noVersionCheck',
    'exclude',
    'selector',
    'state',
    'fullRefresh',
    'defer',
];

const camelToSnakeCase = (str: string) =>
    str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const optionsToArgs = (options: Partial<DbtCompileOptions>): string[] =>
    Object.entries(options).reduce<string[]>((acc, [key, value]) => {
        if (value !== undefined && dbtCompileArgs.includes(key)) {
            const argKey = `--${camelToSnakeCase(key)}`;
            if (typeof value !== 'boolean') {
                return [
                    ...acc,
                    argKey,
                    Array.isArray(value) ? value.join(' ') : value,
                ];
            }
            return [...acc, argKey];
        }
        return acc;
    }, []);

export const dbtCompile = async (options: DbtCompileOptions) => {
    try {
        const args = optionsToArgs(options);
        GlobalState.debug(`> Running: dbt compile ${args.join(' ')}`);
        const { stdout, stderr } = await execa('dbt', ['compile', ...args]);
        console.error(stdout);
        console.error(stderr);
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        throw new ParseError(`Failed to run dbt compile:\n  ${msg}`);
    }
};

const getJoinedModelsRecursively = (
    modelNode: DbtModelNode,
    allModelNodes: DbtModelNode[],
    visited: Set<string> = new Set(),
): string[] => {
    if (visited.has(modelNode.name)) {
        GlobalState.debug(`Already visited ${modelNode.name}. Skipping.`);
        return [];
    }

    GlobalState.debug(`Getting joined models for ${modelNode.name}`);
    visited.add(modelNode.name);

    const joinedModelNames = modelNode.unrendered_config?.meta?.joins?.map(
        (j) => j.join,
    );

    if (!joinedModelNames) {
        return [];
    }

    const joinedModelNodes = allModelNodes.filter((model) =>
        joinedModelNames.includes(model.name),
    );

    return joinedModelNodes.reduce<string[]>(
        (acc, model) => [
            ...acc,
            model.name,
            ...getJoinedModelsRecursively(model, allModelNodes, visited),
        ],
        [],
    );
};

async function dbtList(options: DbtCompileOptions): Promise<string[]> {
    try {
        const args = [
            ...optionsToArgs(options),
            '--output',
            'json',
            '--output-keys',
            'unique_id',
        ];
        const version = await getDbtVersion();
        // only dbt 1.5 and above support --quiet flag
        if (version.versionOption !== SupportedDbtVersions.V1_4) {
            args.push('--quiet');
        }
        GlobalState.debug(`> Running: dbt ls ${args.join(' ')}`);
        const { stdout, stderr } = await execa('dbt', ['ls', ...args]);
        const models = stdout
            .split('\n')
            .map<string>((line) => {
                try {
                    // remove prefixed time in dbt cloud cli output
                    const lineWithoutPrefixedTime = line.replace(
                        /^\d{2}:\d{2}:\d{2}\s*/,
                        '',
                    );
                    return JSON.parse(lineWithoutPrefixedTime).unique_id;
                } catch {
                    // ignore non-json lines
                    return '';
                }
            })
            .filter((modelId) => modelId.startsWith('model.')); // filter models by name because "--models" and "--resource_type" are mutually exclusive arguments
        GlobalState.debug(`> Models: ${models.join(' ')}`);
        console.error(stderr);
        return models;
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        throw new ParseError(
            `Error executing 'dbt ls':\n  ${msg}\nEnsure you're on the latest patch version. '--use-dbt-list' is true by default; if you encounter issues, try using '--use-dbt-list=false`,
        );
    }
}

export async function maybeCompileModelsAndJoins(
    loadManifestOpts: LoadManifestArgs,
    initialOptions: DbtCompileOptions,
): Promise<string[] | undefined> {
    const dbtVersion = await getDbtVersion();
    let options = initialOptions;
    if (dbtVersion.isDbtCloudCLI) {
        options = {
            ...initialOptions,
            projectDir: undefined,
            profilesDir: undefined,
        };
    }

    // Skipping assumes manifest.json already exists.
    if (options.skipDbtCompile) {
        // Check for incompatible selection options
        if (
            options.select ||
            options.exclude ||
            options.selector ||
            options.models
        ) {
            throw new ParseError(
                'Model selection options (--select, --exclude, --selector, --models) cannot be used with --skip-dbt-compile. ' +
                    'Model selection requires running dbt commands to determine which models match the criteria.',
            );
        }
        GlobalState.debug('> Skipping dbt compile');
        return undefined;
    }

    // do initial compilation so we can get the list of models that are compiled after this command (e.g. selecting/excluding by tags)
    let compiledModelIds: string[] | undefined;
    if (options.useDbtList) {
        compiledModelIds = await dbtList(options);
    } else {
        await dbtCompile(options);
    }

    // If no models are explicitly selected or excluded, we don't need to explicitly find joined models
    if (!options.select && !options.exclude) {
        return compiledModelIds;
    }

    // Load manifest and get all models
    const manifest = await loadManifest(loadManifestOpts);
    const allManifestModels = getModelsFromManifest(manifest);
    const currCompiledModels = getCompiledModels(
        allManifestModels,
        compiledModelIds,
    );

    // Get models and their joined models
    const requiredModels = new Set(
        currCompiledModels.reduce<string[]>((acc, model) => {
            const joinedModelNames = getJoinedModelsRecursively(
                model,
                allManifestModels,
                new Set(acc), // minimize recursion by passing already visited models in the current list
            );
            return [...acc, model.name, ...joinedModelNames];
        }, []),
    );

    const requiredModelsNames = Array.from(requiredModels);
    const missingJoinedModels = xor(
        requiredModelsNames,
        currCompiledModels.map((model) => model.name),
    );
    if (missingJoinedModels.length > 0) {
        GlobalState.debug(
            `> Recompile project with missing joined models: ${missingJoinedModels.join(
                ', ',
            )}`,
        );
        if (options.useDbtList) {
            return dbtList({
                ...options,
                select: requiredModelsNames,
            });
        }
        await dbtCompile({
            ...options,
            select: requiredModelsNames,
        });
        return undefined;
    }
    return compiledModelIds;
}
