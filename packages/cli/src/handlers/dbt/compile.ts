import { DbtModelNode, ParseError } from '@lightdash/common';
import execa from 'execa';
import { loadManifest, LoadManifestArgs } from '../../dbt/manifest';
import { getModelsFromManifest } from '../../dbt/models';
import GlobalState from '../../globalState';
import { getDbtVersion } from './getDbtVersion';

export type DbtCompileOptions = {
    profilesDir: string;
    projectDir: string;
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
        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(`Failed to run dbt compile:\n  ${msg}`);
    }
};

export function getCompiledModels(
    manifestModels: DbtModelNode[],
    compiledModelIds?: string[],
) {
    return manifestModels.filter((model) => {
        if (compiledModelIds) {
            return compiledModelIds.includes(model.unique_id);
        }

        return model.compiled;
    });
}

// TODO: Move this to somewhere appropriate
type UnrenderedConfig =
    | {
          meta?: {
              joins?: Array<{ join: string }>;
          };
      }
    | undefined;

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

    const joinedModelNames = (
        modelNode.unrendered_config as UnrenderedConfig
    )?.meta?.joins?.map((j) => j.join);

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

export const compileModelsAndJoins = async (
    loadManifestOpts: LoadManifestArgs,
    options: DbtCompileOptions,
) => {
    // do initial compilation so we can get the list of models that are compiled after this command (e.g. selecting/excluding by tags)
    await dbtCompile(options);

    // If no models are explicitly selected or excluded, we don't need to explicitly find joined models
    if (!options.select && !options.exclude) {
        return;
    }

    // Load manifest and get all models
    const manifest = await loadManifest(loadManifestOpts);
    const allManifestModels = getModelsFromManifest(manifest);
    const currCompiledModels = getCompiledModels(allManifestModels);

    // Selected models and their joined models
    const modelsToCompile = new Set(
        currCompiledModels.reduce<string[]>((acc, model) => {
            const joinedModelNames = getJoinedModelsRecursively(
                model,
                allManifestModels,
                new Set(acc), // minimize recursion by passing already visited models in the current list
            );
            return [...acc, model.name, ...joinedModelNames];
        }, []),
    );

    GlobalState.debug(
        `> Models to compile: ${Array.from(modelsToCompile).join(', ')}`,
    );

    await dbtCompile({
        ...options,
        select: Array.from(modelsToCompile),
    });
};

export const dbtList = async (
    options: DbtCompileOptions,
): Promise<string[]> => {
    try {
        const args = [
            ...optionsToArgs(options),
            '--output',
            'json',
            '--output-keys',
            'unique_id',
        ];
        const version = await getDbtVersion();
        // older dbt versions don't support --quiet flag
        if (!version.startsWith('1.3.') && !version.startsWith('1.4.')) {
            args.push('--quiet');
        }
        GlobalState.debug(`> Running: dbt ls ${args.join(' ')}`);
        const { stdout, stderr } = await execa('dbt', ['ls', ...args]);
        const models = stdout
            .split('\n')
            .map<string>((line) => {
                try {
                    return JSON.parse(line).unique_id;
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
        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(
            `Error executing 'dbt ls':\n  ${msg}\nEnsure you're on the latest patch version. '--use-dbt-list' is true by default; if you encounter issues, try using '--use-dbt-list=false`,
        );
    }
};
