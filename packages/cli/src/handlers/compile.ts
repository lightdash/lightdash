import {
    attachTypesToModels,
    convertExplores,
    convertLightdashModelsToDbtModels,
    DbtManifest,
    DbtManifestVersion,
    DbtModelNode,
    Explore,
    ExploreError,
    getCompiledModels,
    getDbtManifestVersion,
    getErrorMessage,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    LightdashProjectConfig,
    ParseError,
    WarehouseCatalog,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { validateDbtModel } from '../dbt/validation';
import GlobalState from '../globalState';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import { loadLightdashModels } from '../lightdash/loader';
import { detectProjectType } from '../lightdash/projectType';
import * as styles from '../styles';
import { DbtCompileOptions, maybeCompileModelsAndJoins } from './dbt/compile';
import { tryGetDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

export type CompileHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    vars: string | undefined;
    verbose: boolean;
    startOfWeek?: number;
    warehouseCredentials?: boolean;
    disableTimestampConversion?: boolean;
};

const getExploresFromLightdashYmlProject = async (
    projectDir: string,
    lightdashProjectConfig: LightdashProjectConfig,
    startOfWeek?: number,
    disableTimestampConversion?: boolean,
): Promise<(Explore | ExploreError)[] | null> => {
    // Try to load Lightdash YAML models
    const lightdashModels = await loadLightdashModels(projectDir);

    if (lightdashModels.length === 0) {
        return null; // No Lightdash models, use dbt path
    }

    GlobalState.debug(
        `> Found ${lightdashModels.length} Lightdash YAML models`,
    );

    if (!lightdashProjectConfig.warehouse?.type) {
        throw new ParseError(
            'Lightdash models found but no warehouse type specified in lightdash.config.yml.\n' +
                'Add a warehouse section:\n' +
                'warehouse:\n' +
                '  type: postgres  # or bigquery, snowflake, redshift, databricks, trino, clickhouse',
        );
    }

    const adapterType = lightdashProjectConfig.warehouse.type;
    GlobalState.debug(
        `> Using adapter type from lightdash.config.yml: ${adapterType}`,
    );

    // Convert Lightdash models to DbtModelNode format
    const validModels = convertLightdashModelsToDbtModels(lightdashModels);
    if (validModels.length === 0) {
        return null;
    }

    GlobalState.debug('> Skipping warehouse catalog (types in YAML)');

    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        adapterType,
        startOfWeek,
    );

    const validExplores = await convertExplores(
        validModels,
        false,
        warehouseSqlBuilder.getAdapterType(),
        [],
        warehouseSqlBuilder,
        lightdashProjectConfig,
        disableTimestampConversion,
        process.env.PARTIAL_COMPILATION_ENABLED === 'true',
    );

    return validExplores;
};

/**
 * When using --defer, non-selected models pulled in via joins
 * have incorrect schema/relation_name (they point to the dev target
 * instead of production). Return new models with production values
 * from the state manifest.
 */
async function patchDeferredModels(
    compiledModels: DbtModelNode[],
    originallySelectedModelIds: string[],
    state: string,
): Promise<DbtModelNode[]> {
    const statePath = path.resolve(state);
    GlobalState.debug(`> Loading state manifest for defer from ${statePath}`);
    try {
        const stateManifest = await loadManifest({
            targetDir: statePath,
        });
        const stateModels = getModelsFromManifest(stateManifest);
        const stateModelMap = new Map(stateModels.map((m) => [m.unique_id, m]));

        const patchedModels = compiledModels.map((model) => {
            if (originallySelectedModelIds.includes(model.unique_id)) {
                return model;
            }
            const stateModel = stateModelMap.get(model.unique_id);
            if (!stateModel) {
                return model;
            }
            GlobalState.debug(
                `> Deferred model ${model.name}: using production schema ${stateModel.schema}`,
            );
            return {
                ...model,
                relation_name: stateModel.relation_name,
                schema: stateModel.schema,
                database: stateModel.database,
            };
        });

        const patchedCount = patchedModels.filter(
            (m, i) => m !== compiledModels[i],
        ).length;
        if (patchedCount > 0) {
            GlobalState.debug(
                `> Patched ${patchedCount} deferred model(s) with production schema`,
            );
        }
        return patchedModels;
    } catch (e) {
        GlobalState.debug(
            `> Warning: Could not load state manifest for defer patching: ${getErrorMessage(e)}`,
        );
        return compiledModels;
    }
}

export const compile = async (options: CompileHandlerOptions) => {
    const dbtVersionResult = await tryGetDbtVersion();
    const executionId = uuidv4();
    const startTime = Date.now();

    await LightdashAnalytics.track({
        event: 'compile.started',
        properties: {
            executionId,
            dbtVersion: dbtVersionResult.success
                ? dbtVersionResult.version.verboseVersion
                : undefined,
            useDbtList: !!options.useDbtList,
            skipWarehouseCatalog: !!options.skipWarehouseCatalog,
            skipDbtCompile: !!options.skipDbtCompile,
        },
    });

    const absoluteProjectPath = path.resolve(options.projectDir);

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);

    const lightdashProjectConfig =
        await readAndLoadLightdashProjectConfig(absoluteProjectPath);
    GlobalState.debug(`> Loaded lightdash project config`);

    // Try lightdash project compile
    let explores: (Explore | ExploreError)[] | null = null;
    let dbtMetrics: DbtManifest['metrics'] | null = null;

    explores = await getExploresFromLightdashYmlProject(
        absoluteProjectPath,
        lightdashProjectConfig,
        options.startOfWeek,
        options.disableTimestampConversion,
    );

    // Load dbt Project
    if (explores === null) {
        if (!dbtVersionResult.success) {
            await LightdashAnalytics.track({
                event: 'compile.error',
                properties: {
                    executionId,
                    error: 'dbt not found',
                },
            });

            throw dbtVersionResult.error;
        }

        const context = await getDbtContext({
            projectDir: absoluteProjectPath,
            targetPath: options.targetPath,
        });

        const { compiledModelIds, originallySelectedModelIds } =
            await maybeCompileModelsAndJoins(
                { targetDir: context.targetDir },
                options,
            );
        const manifest = await loadManifest({ targetDir: context.targetDir });
        const manifestVersion = getDbtManifestVersion(manifest);
        const manifestModels = getModelsFromManifest(manifest);
        const compiledModels = getCompiledModels(
            manifestModels,
            compiledModelIds,
        );

        // When using --defer, non-selected models pulled in via joins
        // have incorrect schema/relation_name (they point to the dev target
        // instead of production). Patch them from the state manifest.
        const modelsForValidation =
            options.defer && options.state && originallySelectedModelIds
                ? await patchDeferredModels(
                      compiledModels,
                      originallySelectedModelIds,
                      options.state,
                  )
                : compiledModels;

        const adapterType = manifest.metadata.adapter_type;
        const { valid: validModels, invalid: failedExplores } =
            await validateDbtModel(
                adapterType,
                manifestVersion,
                modelsForValidation,
            );

        if (failedExplores.length > 0) {
            const errors = failedExplores.map((failedExplore) =>
                failedExplore.errors.map(
                    (error) => `- ${failedExplore.name}: ${error.message}\n`,
                ),
            );
            console.error(
                styles.warning(`Found ${
                    failedExplores.length
                } errors when validating dbt models:
    ${errors.join('')}`),
            );
        }

        // Skipping assumes yml has the field types.
        let catalog: WarehouseCatalog = {};
        if (!options.skipWarehouseCatalog) {
            const { warehouseClient } = await getWarehouseClient({
                isDbtCloudCLI: dbtVersionResult.success
                    ? dbtVersionResult.version.isDbtCloudCLI
                    : false,
                profilesDir: options.profilesDir,
                profile: options.profile || context.profileName,
                target: options.target,
                startOfWeek: options.startOfWeek,
            });
            GlobalState.debug('> Fetching warehouse catalog');
            catalog = await warehouseClient.getCatalog(
                getSchemaStructureFromDbtModels(validModels),
            );
        } else {
            GlobalState.debug('> Skipping warehouse catalog');
        }

        const validModelsWithTypes = attachTypesToModels(
            validModels,
            catalog,
            false,
        );

        if (!isSupportedDbtAdapter(manifest.metadata)) {
            await LightdashAnalytics.track({
                event: 'compile.error',
                properties: {
                    executionId,
                    dbtVersion: dbtVersionResult.success
                        ? dbtVersionResult.version.verboseVersion
                        : undefined,
                    error: `Dbt adapter ${manifest.metadata.adapter_type} is not supported`,
                },
            });
            throw new ParseError(
                `Dbt adapter ${manifest.metadata.adapter_type} is not supported`,
            );
        }

        GlobalState.debug(
            `> Converting explores with adapter: ${manifest.metadata.adapter_type}`,
        );

        GlobalState.debug(
            `> Loading lightdash project config from ${absoluteProjectPath}`,
        );

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            adapterType,
            options.startOfWeek,
        );

        const validExplores = await convertExplores(
            validModelsWithTypes,
            false,
            manifest.metadata.adapter_type,
            [
                DbtManifestVersion.V10,
                DbtManifestVersion.V11,
                DbtManifestVersion.V12,
            ].includes(manifestVersion)
                ? []
                : Object.values(manifest.metrics || {}),
            warehouseSqlBuilder,
            lightdashProjectConfig,
            options.disableTimestampConversion,
            process.env.PARTIAL_COMPILATION_ENABLED === 'true',
        );
        console.error('');

        explores = [...validExplores, ...failedExplores];
        dbtMetrics = manifest.metrics;
    }

    let errors = 0;
    let partialSuccess = 0;
    let success = 0;

    explores.forEach((e) => {
        let status: string;
        let messages = '';

        if (isExploreError(e)) {
            status = styles.error('ERROR');
            messages = `: ${styles.error(e.errors.map((err) => err.message).join(', '))}`;
            errors += 1;
        } else if (
            process.env.PARTIAL_COMPILATION_ENABLED === 'true' &&
            'warnings' in e &&
            e.warnings &&
            e.warnings.length > 0
        ) {
            status = styles.warning('PARTIAL_SUCCESS');
            messages = `: ${styles.warning(e.warnings.map((warning) => warning.message).join(', '))}`;
            partialSuccess += 1;
        } else {
            status = styles.success('SUCCESS');
            success += 1;
        }

        console.error(`- ${status}> ${e.name} ${messages}`);
    });
    console.error('');

    if (
        process.env.PARTIAL_COMPILATION_ENABLED === 'true' &&
        partialSuccess > 0
    ) {
        console.error(
            `Compiled ${explores.length} explores, SUCCESS=${success} PARTIAL_SUCCESS=${partialSuccess} ERRORS=${errors}`,
        );
    } else {
        console.error(
            `Compiled ${explores.length} explores, SUCCESS=${success} ERRORS=${errors}`,
        );
    }

    const metricsCount =
        dbtMetrics === null ? 0 : Object.values(dbtMetrics).length;
    await LightdashAnalytics.track({
        event: 'compile.completed',
        properties: {
            executionId,
            explores: explores.length,
            errors,
            dbtMetrics: metricsCount,
            dbtVersion: dbtVersionResult.success
                ? dbtVersionResult.version.verboseVersion
                : undefined,
            durationMs: Date.now() - startTime,
        },
    });
    return explores;
};

export const compileHandler = async (
    originalOptions: CompileHandlerOptions,
) => {
    const options = { ...originalOptions };

    // Detect project type and configure options accordingly
    const projectTypeConfig = await detectProjectType({
        projectDir: options.projectDir,
        userOptions: {
            warehouseCredentials: options.warehouseCredentials,
            skipDbtCompile: options.skipDbtCompile,
            skipWarehouseCatalog: options.skipWarehouseCatalog,
        },
    });

    // Apply project type configuration to options
    options.warehouseCredentials = projectTypeConfig.warehouseCredentials;
    options.skipDbtCompile = projectTypeConfig.skipDbtCompile;
    options.skipWarehouseCatalog = projectTypeConfig.skipWarehouseCatalog;

    GlobalState.setVerbose(options.verbose);
    const explores = await compile(options);
    const errorsCount = explores.filter((e) => isExploreError(e)).length;
    console.error('');
    if (errorsCount > 0) {
        console.error(
            styles.error(
                `Failed to compile project. Found ${errorsCount} error${
                    errorsCount > 1 ? 's' : ''
                }`,
            ),
        );
        process.exit(1);
    } else {
        console.error(styles.success('Successfully compiled project'));
    }
};
