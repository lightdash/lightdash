import {
    attachTypesToModels,
    convertExplores,
    convertLightdashModelsToDbtModels,
    DbtManifest,
    DbtModelNode,
    Explore,
    ExploreError,
    getCompiledModels,
    getDbtManifestVersion,
    getErrorMessage,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    InlineErrorType,
    isExploreError,
    isSupportedDbtAdapter,
    LightdashProjectConfig,
    ParseError,
    preAggregatePostProcessor,
    QueryExecutionContext,
    translateMetricFlowMetrics,
    WarehouseCatalog,
    type InlineError,
    type WarehouseClient,
} from '@lightdash/common';
import {
    validateWarehouseColumnReferences,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import {
    combineManifests,
    loadCombineManifest,
    loadManifest,
} from '../dbt/manifest';
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
    validateWarehouseColumns?: boolean;
};

// Warehouse column warnings come from explicit `--validate-warehouse-columns`
// probing, not partial compilation, so the env gate must never hide them.
const getDisplayableWarnings = (explore: Explore): InlineError[] => {
    const warnings = explore.warnings ?? [];
    if (process.env.PARTIAL_COMPILATION_ENABLED !== 'false') {
        return warnings;
    }
    return warnings.filter(
        (warning) => warning.type === InlineErrorType.WAREHOUSE_COLUMN_ERROR,
    );
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
        warehouseSqlBuilder,
        lightdashProjectConfig,
        {
            disableTimestampConversion,
            allowPartialCompilation:
                process.env.PARTIAL_COMPILATION_ENABLED !== 'false',
            postProcessors: [preAggregatePostProcessor],
        },
    );

    return validExplores;
};

/**
 * Translate dbt MetricFlow definitions (`semantic_models` + `metrics`) from the
 * manifest into Lightdash metrics and merge them into each model's meta so they
 * compile through the normal explore pipeline. YAML-defined metrics take
 * priority over translated ones on name collision. No-op when the manifest has
 * no semantic models.
 */
const applyMetricFlowMetrics = (
    models: DbtModelNode[],
    manifest: DbtManifest,
): DbtModelNode[] => {
    const semanticModels = manifest.semantic_models;
    if (!semanticModels || Object.keys(semanticModels).length === 0) {
        return models;
    }

    const modelNamesByUniqueId = Object.fromEntries(
        models.map((model) => [model.unique_id, model.name]),
    );

    // MetricFlow translation is best-effort: a malformed manifest must never
    // abort the compile/deploy, so degrade to "no translated metrics".
    let translation: ReturnType<typeof translateMetricFlowMetrics>;
    try {
        translation = translateMetricFlowMetrics({
            semanticModels,
            metrics: manifest.metrics ?? {},
            modelNamesByUniqueId,
        });
    } catch (e) {
        console.error(
            styles.warning(
                `> Failed to translate MetricFlow metrics, continuing without them: ${getErrorMessage(
                    e,
                )}`,
            ),
        );
        return models;
    }
    const { metricsByModel, warnings, translatedCount, skippedCount } =
        translation;

    warnings.forEach((warning) => GlobalState.debug(`> ${warning}`));

    if (translatedCount === 0) {
        if (skippedCount > 0) {
            console.error(
                styles.warning(
                    `> Skipped ${skippedCount} unsupported MetricFlow metric(s). Run with --verbose for details.`,
                ),
            );
        }
        return models;
    }

    const skippedSuffix =
        skippedCount > 0
            ? ` (skipped ${skippedCount} unsupported, run with --verbose for details)`
            : '';
    console.error(
        styles.info(
            `> Translated ${translatedCount} MetricFlow metric(s) into Lightdash metrics${skippedSuffix}`,
        ),
    );

    return models.map((model) => {
        const modelMetrics = metricsByModel[model.name];
        if (!modelMetrics) {
            return model;
        }
        return {
            ...model,
            meta: {
                ...model.meta,
                metrics: { ...modelMetrics, ...model.meta.metrics },
            },
        };
    });
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

    if (explores !== null && options.validateWarehouseColumns === true) {
        console.error(
            styles.warning(
                '> Skipping warehouse column validation because it is not supported for Lightdash YAML projects',
            ),
        );
    }

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
        let manifest = await loadManifest({ targetDir: context.targetDir });
        let effectiveCompiledModelIds = compiledModelIds;
        if (options.combineManifest) {
            const externalManifest = await loadCombineManifest(
                options.combineManifest,
            );
            const { manifest: merged, addedModelIds } = combineManifests(
                manifest,
                externalManifest,
            );
            manifest = merged;
            if (
                effectiveCompiledModelIds !== undefined &&
                addedModelIds.length > 0
            ) {
                effectiveCompiledModelIds = [
                    ...effectiveCompiledModelIds,
                    ...addedModelIds,
                ];
            }
            console.info(
                styles.info(
                    `Combined external manifest from ${options.combineManifest}: added ${addedModelIds.length} model(s) not present in the preview manifest`,
                ),
            );
        }
        const manifestVersion = getDbtManifestVersion(manifest);
        const manifestModels = getModelsFromManifest(manifest);
        const compiledModels = getCompiledModels(
            manifestModels,
            effectiveCompiledModelIds,
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
        let validationWarehouseClient: WarehouseClient | null = null;
        if (!options.skipWarehouseCatalog) {
            const isDbtCloudCLI =
                dbtVersionResult.success &&
                dbtVersionResult.version.isDbtCloudCLI;
            const { warehouseClient } = await getWarehouseClient({
                isDbtCloudCLI,
                profilesDir: options.profilesDir,
                profile: options.profile || context.profileName,
                target: options.target,
                startOfWeek: options.startOfWeek,
            });
            // dbt Cloud CLI clients stub runQuery, so column probing would
            // silently pass instead of validating anything
            if (!isDbtCloudCLI) {
                validationWarehouseClient = warehouseClient;
            } else if (options.validateWarehouseColumns === true) {
                console.error(
                    styles.warning(
                        '> Skipping warehouse column validation because dbt Cloud CLI cannot run warehouse queries',
                    ),
                );
            }
            GlobalState.debug('> Fetching warehouse catalog');
            catalog = await warehouseClient.getCatalog(
                getSchemaStructureFromDbtModels(validModels),
            );
        } else {
            GlobalState.debug('> Skipping warehouse catalog');
            if (options.validateWarehouseColumns === true) {
                console.error(
                    styles.warning(
                        '> Skipping warehouse column validation because --skip-warehouse-catalog was supplied',
                    ),
                );
            }
        }

        const validModelsWithTypes = applyMetricFlowMetrics(
            attachTypesToModels(
                validModels,
                catalog,
                false,
                // Snowflake catalogs report uppercase identifiers; match the
                // server-side adapter rule (dbtBaseProjectAdapter).
                adapterType !== 'snowflake',
            ),
            manifest,
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
            warehouseSqlBuilder,
            lightdashProjectConfig,
            {
                disableTimestampConversion: options.disableTimestampConversion,
                allowPartialCompilation:
                    process.env.PARTIAL_COMPILATION_ENABLED !== 'false',
                postProcessors: [preAggregatePostProcessor],
            },
        );
        const validatedExplores =
            options.validateWarehouseColumns === true &&
            validationWarehouseClient
                ? await validateWarehouseColumnReferences({
                      explores: validExplores,
                      client: validationWarehouseClient,
                      tags: {
                          query_context: QueryExecutionContext.CLI,
                      },
                  })
                : validExplores;
        console.error('');

        explores = [...validatedExplores, ...failedExplores];
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
        } else {
            const warnings = getDisplayableWarnings(e);
            if (warnings.length > 0) {
                status = styles.warning('PARTIAL_SUCCESS');
                messages = `\n${warnings
                    .map(
                        (warning) =>
                            `    ${styles.warning(`⚠ ${warning.message}`)}`,
                    )
                    .join('\n')}`;
                partialSuccess += 1;
            } else {
                status = styles.success('SUCCESS');
                success += 1;
            }
        }

        console.error(`- ${status}> ${e.name} ${messages}`);
    });
    console.error('');

    if (partialSuccess > 0) {
        console.error(
            `Compiled ${explores.length} explores, SUCCESS=${success} PARTIAL_SUCCESS=${partialSuccess} ERRORS=${errors}`,
        );
    } else {
        console.error(
            `Compiled ${explores.length} explores, SUCCESS=${success} ERRORS=${errors}`,
        );
    }

    const metricsCount = dbtMetrics ? Object.values(dbtMetrics).length : 0;
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
