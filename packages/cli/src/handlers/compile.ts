import {
    attachTypesToModels,
    convertExplores,
    CreateBigqueryCredentials,
    DbtManifest,
    DbtManifestVersion,
    Explore,
    ExploreError,
    getDbtManifestVersion,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    isWeekDay,
    ParseError,
    WarehouseCatalog,
    WarehouseTypes,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { getModelsFromManifest } from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import { validateDbtModel } from '../dbt/validation';
import GlobalState from '../globalState';
import * as styles from '../styles';
import {
    DbtCompileOptions,
    getCompiledModels,
    maybeCompileModelsAndJoins,
} from './dbt/compile';
import { getDbtVersion } from './dbt/getDbtVersion';

export type CompileHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    vars: string | undefined;
    verbose: boolean;
    startOfWeek?: number;
};

type DbtCloudCompileHandlerOptions = DbtCompileOptions & {
    startOfWeek?: number;
};

type CompileResult = {
    explores: (Explore | ExploreError)[];
    errors: number;
    manifest: DbtManifest;
};

export const compileDbtCloud = async (
    options: DbtCloudCompileHandlerOptions,
): Promise<CompileResult> => {
    const dbtVersion = await getDbtVersion();
    GlobalState.debug(`> dbt version ${dbtVersion.verboseVersion}`);
    const executionId = uuidv4();
    await LightdashAnalytics.track({
        event: 'compile.started',
        properties: {
            executionId,
            dbtVersion: dbtVersion.verboseVersion,
            useDbtList: !!options.useDbtList,
            skipWarehouseCatalog: !!options.skipWarehouseCatalog,
            skipDbtCompile: !!options.skipDbtCompile,
        },
    });

    const absoluteProjectPath = path.resolve('.');

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);

    const context = await getDbtContext({ projectDir: absoluteProjectPath });

    const compiledModelIds: string[] | undefined =
        await maybeCompileModelsAndJoins(
            { targetDir: context.targetDir },
            options,
        );

    const profileName = options.profile || context.profileName;

    GlobalState.debug(`> Compiling with profile ${profileName}`);

    // TODO: Implement this
    const mockDbtCloudCredentials: CreateBigqueryCredentials = {
        type: WarehouseTypes.BIGQUERY,
        project: '',
        dataset: '',
        keyfileContents: {},
        location: undefined,
        maximumBytesBilled: undefined,
        priority: undefined,
        retries: undefined,
        timeoutSeconds: undefined,
    };

    const warehouseClient = warehouseClientFromCredentials({
        ...mockDbtCloudCredentials,
        startOfWeek: isWeekDay(options.startOfWeek)
            ? options.startOfWeek
            : undefined,
    });

    const manifest = await loadManifest({ targetDir: context.targetDir });
    const manifestVersion = getDbtManifestVersion(manifest);
    const manifestModels = getModelsFromManifest(manifest);
    const compiledModels = getCompiledModels(manifestModels, compiledModelIds);

    const adapterType = manifest.metadata.adapter_type;
    const { valid: validModels, invalid: failedExplores } =
        await validateDbtModel(adapterType, manifestVersion, compiledModels);

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
    const catalog: WarehouseCatalog = {};
    // if (!options.skipWarehouseCatalog) {
    //     GlobalState.debug('> Fetching warehouse catalog');
    //     catalog = await warehouseClient.getCatalog(
    //         getSchemaStructureFromDbtModels(validModels),
    //     );
    // } else {
    //     GlobalState.debug('> Skipping warehouse catalog');
    // }

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
                dbtVersion: dbtVersion.verboseVersion,
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
            : Object.values(manifest.metrics),
        warehouseClient,
    );
    console.error('');

    const explores = [...validExplores, ...failedExplores];

    explores.forEach((e) => {
        const status = isExploreError(e)
            ? styles.error('ERROR')
            : styles.success('SUCCESS');
        const errors = isExploreError(e)
            ? `: ${styles.error(e.errors.map((err) => err.message).join(', '))}`
            : '';
        console.error(`- ${status}> ${e.name} ${errors}`);
    });
    console.error('');
    const errors = explores.filter((e) => isExploreError(e)).length;
    console.error(
        `Compiled ${explores.length} explores, SUCCESS=${
            explores.length - errors
        } ERRORS=${errors}`,
    );

    await LightdashAnalytics.track({
        event: 'compile.completed',
        properties: {
            executionId,
            explores: explores.length,
            errors,
            dbtMetrics: Object.values(manifest.metrics).length,
            dbtVersion: dbtVersion.verboseVersion,
        },
    });
    return {
        explores,
        errors,
        manifest,
    };
};
export const compileDbtCore = async (options: CompileHandlerOptions) => {
    const dbtVersion = await getDbtVersion();
    GlobalState.debug(`> dbt version ${dbtVersion}`);
    const executionId = uuidv4();
    await LightdashAnalytics.track({
        event: 'compile.started',
        properties: {
            executionId,
            dbtVersion: dbtVersion.verboseVersion,
            useDbtList: !!options.useDbtList,
            skipWarehouseCatalog: !!options.skipWarehouseCatalog,
            skipDbtCompile: !!options.skipDbtCompile,
        },
    });

    if (!options.projectDir || !options.profilesDir) {
        throw new Error(
            'project dir and profiles dir are required for dbt core',
        );
    }

    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);
    GlobalState.debug(`> Compiling with profiles dir ${absoluteProfilesPath}`);

    const context = await getDbtContext({ projectDir: absoluteProjectPath });

    const compiledModelIds: string[] | undefined =
        await maybeCompileModelsAndJoins(
            { targetDir: context.targetDir },
            options,
        );

    const profileName = options.profile || context.profileName;
    const { target } = await loadDbtTarget({
        profilesDir: absoluteProfilesPath,
        profileName,
        targetName: options.target,
    });

    GlobalState.debug(`> Compiling with profile ${profileName}`);
    GlobalState.debug(`> Compiling with target ${target}`);

    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const warehouseClient = warehouseClientFromCredentials({
        ...credentials,
        startOfWeek: isWeekDay(options.startOfWeek)
            ? options.startOfWeek
            : undefined,
    });

    const manifest = await loadManifest({ targetDir: context.targetDir });
    const manifestVersion = getDbtManifestVersion(manifest);
    const manifestModels = getModelsFromManifest(manifest);
    const compiledModels = getCompiledModels(manifestModels, compiledModelIds);

    const adapterType = manifest.metadata.adapter_type;
    const { valid: validModels, invalid: failedExplores } =
        await validateDbtModel(adapterType, manifestVersion, compiledModels);

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
                dbtVersion: dbtVersion.verboseVersion,
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
            : Object.values(manifest.metrics),
        warehouseClient,
    );
    console.error('');

    const explores = [...validExplores, ...failedExplores];

    explores.forEach((e) => {
        const status = isExploreError(e)
            ? styles.error('ERROR')
            : styles.success('SUCCESS');
        const errors = isExploreError(e)
            ? `: ${styles.error(e.errors.map((err) => err.message).join(', '))}`
            : '';
        console.error(`- ${status}> ${e.name} ${errors}`);
    });
    console.error('');
    const errors = explores.filter((e) => isExploreError(e)).length;
    console.error(
        `Compiled ${explores.length} explores, SUCCESS=${
            explores.length - errors
        } ERRORS=${errors}`,
    );

    await LightdashAnalytics.track({
        event: 'compile.completed',
        properties: {
            executionId,
            explores: explores.length,
            errors,
            dbtMetrics: Object.values(manifest.metrics).length,
            dbtVersion: dbtVersion.verboseVersion,
        },
    });
    return {
        explores,
        errors,
        manifest,
    };
};
export const compile = async (options: CompileHandlerOptions) => {
    const dbtVersion = await getDbtVersion();
    const { explores } = dbtVersion.isDbtCloudCLI
        ? await compileDbtCloud({
              ...options,
              projectDir: undefined,
              profilesDir: undefined,
          })
        : await compileDbtCore(options);
    return explores;
};
export const compileHandler = async (options: CompileHandlerOptions) => {
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
