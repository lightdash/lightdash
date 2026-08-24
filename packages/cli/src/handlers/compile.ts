import {
    applyMetricFlowMetricsToModels,
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
    LightdashError,
    LightdashProjectConfig,
    ParseError,
    preAggregatePostProcessor,
    QueryExecutionContext,
    WarehouseCatalog,
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
import { lightdashRawApi } from './dbt/apiClient';
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
    partialCompilation?: boolean;
    combineManifestProjectUuid?: string;
    combine?: boolean;
};

export type CompileProjectResult = {
    explores: (Explore | ExploreError)[];
    isProjectComplete: boolean;
};

export const hasBlockingCompileError = (
    explore: Explore | ExploreError,
): boolean =>
    isExploreError(explore) ||
    explore.warnings?.some(
        (warning) => warning.type === InlineErrorType.WAREHOUSE_COLUMN_ERROR,
    ) === true;

export const stripWarehouseColumnErrors = (
    explore: Explore | ExploreError,
): Explore | ExploreError => {
    if (isExploreError(explore) || explore.warnings === undefined) {
        return explore;
    }

    const { warnings: currentWarnings, ...exploreWithoutWarnings } = explore;
    const warnings = currentWarnings.filter(
        (warning) => warning.type !== InlineErrorType.WAREHOUSE_COLUMN_ERROR,
    );

    if (warnings.length === currentWarnings.length) {
        return explore;
    }

    return warnings.length > 0
        ? { ...exploreWithoutWarnings, warnings }
        : exploreWithoutWarnings;
};

type SourceAnnotatedDbtNode = DbtManifest['nodes'][string] & {
    lightdash_source_name?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isServedDbtManifest = (value: unknown): value is DbtManifest =>
    isRecord(value) && isRecord(value.nodes) && isRecord(value.metadata);

const getManifestModelIds = (manifest: DbtManifest): string[] =>
    Object.entries(manifest.nodes)
        .filter(([, node]) => node.resource_type === 'model')
        .map(([uniqueId]) => uniqueId);

const getCompiledManifestModelIds = (manifest: DbtManifest): string[] =>
    Object.entries(manifest.nodes)
        .filter(
            ([, node]) =>
                node.resource_type === 'model' &&
                (node as SourceAnnotatedDbtNode & { compiled?: boolean })
                    .compiled === true,
        )
        .map(([uniqueId]) => uniqueId);

const inferLocalSourceName = (
    localManifest: DbtManifest,
    servedManifest: DbtManifest,
): string | undefined => {
    const sourceNames = new Set(
        getManifestModelIds(localManifest).flatMap((uniqueId) => {
            const servedNode = servedManifest.nodes[uniqueId] as
                | SourceAnnotatedDbtNode
                | undefined;
            return servedNode?.resource_type === 'model' &&
                typeof servedNode.lightdash_source_name === 'string'
                ? [servedNode.lightdash_source_name]
                : [];
        }),
    );

    if (sourceNames.size > 1) {
        throw new ParseError(
            `Cannot automatically combine manifest from the server: overlapping local models match multiple Lightdash sources (${[...sourceNames].sort().join(', ')})`,
        );
    }

    return sourceNames.values().next().value;
};

const withoutModelsFromSource = (
    manifest: DbtManifest,
    sourceName: string,
): DbtManifest => ({
    ...manifest,
    nodes: Object.fromEntries(
        Object.entries(manifest.nodes).filter(([, node]) => {
            const sourceAnnotatedNode = node as SourceAnnotatedDbtNode;
            return !(
                node.resource_type === 'model' &&
                sourceAnnotatedNode.lightdash_source_name === sourceName
            );
        }),
    ),
});

const withoutUnselectedOverlappingModels = (
    localManifest: DbtManifest,
    servedManifest: DbtManifest,
    sourceName: string,
    selectedModelIds: Set<string>,
): DbtManifest => ({
    ...localManifest,
    nodes: Object.fromEntries(
        Object.entries(localManifest.nodes).filter(([uniqueId, localNode]) => {
            const servedNode = servedManifest.nodes[uniqueId] as
                | SourceAnnotatedDbtNode
                | undefined;
            return !(
                localNode.resource_type === 'model' &&
                !selectedModelIds.has(uniqueId) &&
                servedNode?.resource_type === 'model' &&
                servedNode.lightdash_source_name === sourceName
            );
        }),
    ),
});

const combinePreviewManifests = (
    localManifest: DbtManifest,
    externalManifest: DbtManifest,
    localSourceName?: string,
) => {
    const { manifest, addedModelIds } = combineManifests(
        localManifest,
        externalManifest,
    );
    const nodes = { ...manifest.nodes };

    Object.entries(localManifest.nodes).forEach(([uniqueId, localNode]) => {
        const externalNode = externalManifest.nodes[uniqueId] as
            | SourceAnnotatedDbtNode
            | undefined;
        const sourceName =
            localNode.resource_type === 'model' && localSourceName !== undefined
                ? localSourceName
                : externalNode?.lightdash_source_name;
        if (typeof sourceName === 'string') {
            nodes[uniqueId] = {
                ...nodes[uniqueId],
                lightdash_source_name: sourceName,
            } as DbtManifest['nodes'][string];
        }
    });

    return { manifest: { ...manifest, nodes }, addedModelIds };
};

const getDisplayableDiagnostics = (
    explore: Explore,
    allowPartialCompilation: boolean,
) => {
    const diagnostics = explore.warnings ?? [];
    const errors = diagnostics.filter(
        (diagnostic) =>
            diagnostic.type === InlineErrorType.WAREHOUSE_COLUMN_ERROR,
    );
    const warnings = allowPartialCompilation
        ? diagnostics.filter(
              (diagnostic) =>
                  diagnostic.type !== InlineErrorType.WAREHOUSE_COLUMN_ERROR,
          )
        : [];
    return { errors, warnings };
};

const getExploresFromLightdashYmlProject = async ({
    projectDir,
    lightdashProjectConfig,
    startOfWeek,
    disableTimestampConversion,
    allowPartialCompilation,
}: {
    projectDir: string;
    lightdashProjectConfig: LightdashProjectConfig;
    startOfWeek: number | undefined;
    disableTimestampConversion: boolean | undefined;
    allowPartialCompilation: boolean;
}): Promise<(Explore | ExploreError)[] | null> => {
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
            allowPartialCompilation,
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
    // MetricFlow translation is best-effort: a malformed manifest must never
    // abort the compile/deploy, so degrade to "no translated metrics".
    const {
        models: modelsWithMetrics,
        warnings,
        translatedCount,
        skippedCount,
        error,
    } = applyMetricFlowMetricsToModels(models, manifest);

    if (error !== null) {
        console.error(
            styles.warning(
                `> Failed to translate MetricFlow metrics, continuing without them: ${error}`,
            ),
        );
        return models;
    }

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

    return modelsWithMetrics;
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

export const compileProject = async (
    options: CompileHandlerOptions,
): Promise<CompileProjectResult> => {
    const dbtVersionResult = await tryGetDbtVersion();
    const executionId = uuidv4();
    const startTime = Date.now();
    const allowPartialCompilation = options.partialCompilation !== false;

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
    let isProjectComplete = true;

    explores = await getExploresFromLightdashYmlProject({
        projectDir: absoluteProjectPath,
        lightdashProjectConfig,
        startOfWeek: options.startOfWeek,
        disableTimestampConversion: options.disableTimestampConversion,
        allowPartialCompilation,
    });

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
        const projectManifestModels = getModelsFromManifest(manifest);
        isProjectComplete =
            getCompiledModels(projectManifestModels, compiledModelIds)
                .length === projectManifestModels.length;
        let effectiveCompiledModelIds = compiledModelIds;
        const servedModelIds = new Set<string>();
        let additionalManifest: DbtManifest | undefined;
        let combineSource: string | undefined;
        let isAutomaticServerManifest = false;
        if (options.combineManifest) {
            additionalManifest = await loadCombineManifest(
                options.combineManifest,
            );
            combineSource = `external manifest from ${options.combineManifest}`;
        } else if (
            options.combine !== false &&
            options.combineManifestProjectUuid
        ) {
            try {
                const manifestEndpoint = `/api/v1/projects/${options.combineManifestProjectUuid}/dbt/manifest`;
                const response = await lightdashRawApi({
                    method: 'GET',
                    url: manifestEndpoint,
                    body: undefined,
                });
                const servedManifest: unknown = await response.json();
                if (!isServedDbtManifest(servedManifest)) {
                    throw new Error(
                        `${manifestEndpoint} returned an invalid manifest: expected an object with metadata and a nodes record`,
                    );
                }
                additionalManifest = servedManifest;
                combineSource = 'manifest from the server';
                isAutomaticServerManifest = true;
            } catch (error) {
                if (
                    error instanceof LightdashError &&
                    error.statusCode === 404
                ) {
                    console.info(
                        styles.info(
                            'No server manifest found; continuing with the preview manifest',
                        ),
                    );
                } else {
                    console.error(
                        styles.warning(
                            `Could not fetch the server manifest; continuing with the preview manifest: ${getErrorMessage(error)}`,
                        ),
                    );
                }
            }
        }
        if (additionalManifest && combineSource) {
            const localSourceName = isAutomaticServerManifest
                ? inferLocalSourceName(manifest, additionalManifest)
                : undefined;

            if (isAutomaticServerManifest && localSourceName === undefined) {
                console.info(
                    styles.info(
                        `Skipped combining ${combineSource}: the local dbt project is not a source of this Lightdash project`,
                    ),
                );
            } else {
                const localManifest =
                    isAutomaticServerManifest &&
                    !isProjectComplete &&
                    localSourceName !== undefined
                        ? withoutUnselectedOverlappingModels(
                              manifest,
                              additionalManifest,
                              localSourceName,
                              new Set(
                                  originallySelectedModelIds ??
                                      compiledModelIds ??
                                      [],
                              ),
                          )
                        : manifest;
                const externalManifest =
                    isAutomaticServerManifest &&
                    isProjectComplete &&
                    localSourceName !== undefined
                        ? withoutModelsFromSource(
                              additionalManifest,
                              localSourceName,
                          )
                        : additionalManifest;
                const compiledExternalModelIds =
                    getCompiledManifestModelIds(additionalManifest);
                const { manifest: merged, addedModelIds } =
                    combinePreviewManifests(
                        localManifest,
                        externalManifest,
                        localSourceName,
                    );
                manifest = merged;
                if (isAutomaticServerManifest) {
                    addedModelIds.forEach((modelId) => {
                        servedModelIds.add(modelId);
                    });
                }
                if (
                    effectiveCompiledModelIds !== undefined &&
                    addedModelIds.length > 0
                ) {
                    effectiveCompiledModelIds = [
                        ...effectiveCompiledModelIds,
                        ...addedModelIds,
                    ];
                }

                let combineResult: string;
                if (addedModelIds.length > 0) {
                    combineResult = `added ${addedModelIds.length} model(s) not present in the preview manifest`;
                } else if (compiledExternalModelIds.length === 0) {
                    combineResult =
                        'added 0 model(s) because the manifest contains no compiled models';
                } else {
                    combineResult =
                        'added 0 model(s) because all compiled models already exist in the preview manifest';
                }
                console.info(
                    styles.info(`Combined ${combineSource}: ${combineResult}`),
                );
            }
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
                servedModelIds,
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
                        '> Skipping warehouse column validation because the warehouse catalog is skipped',
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
                allowPartialCompilation,
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
            const { errors: warehouseErrors, warnings } =
                getDisplayableDiagnostics(e, allowPartialCompilation);
            if (warehouseErrors.length > 0) {
                status = styles.error('ERROR');
                messages = `: ${styles.error(
                    warehouseErrors.map((error) => error.message).join(', '),
                )}`;
                if (warnings.length > 0) {
                    messages += `\n${warnings
                        .map(
                            (warning) =>
                                `    ${styles.warning(`⚠ ${warning.message}`)}`,
                        )
                        .join('\n')}`;
                }
                errors += 1;
            } else if (warnings.length > 0) {
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
    return { explores, isProjectComplete };
};

export const compile = async (
    options: CompileHandlerOptions,
): Promise<(Explore | ExploreError)[]> =>
    (await compileProject(options)).explores;

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
    const errorsCount = explores.filter(hasBlockingCompileError).length;
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
