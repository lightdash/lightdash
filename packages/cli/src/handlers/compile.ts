import {
    attachTypesToModels,
    convertExplores,
    DbtManifestVersion,
    DEFAULT_SPOTLIGHT_CONFIG,
    getCompiledModels,
    getDbtManifestVersion,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    loadLightdashProjectConfig,
    ParseError,
    WarehouseCatalog,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { validateDbtModel } from '../dbt/validation';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { DbtCompileOptions, maybeCompileModelsAndJoins } from './dbt/compile';
import { getDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

export type CompileHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    vars: string | undefined;
    verbose: boolean;
    startOfWeek?: number;
};

const readAndLoadLightdashProjectConfig = async (projectDir: string) => {
    const configPath = path.join(projectDir, 'lightdash.config.yml');
    try {
        const fileContents = await fs.readFile(configPath, 'utf8');
        const config = await loadLightdashProjectConfig(fileContents);
        return config;
    } catch (e) {
        GlobalState.debug(`No lightdash.config.yml found in ${configPath}`);

        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            // Return default config if file doesn't exist
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }
        throw e;
    }
};

export const compile = async (options: CompileHandlerOptions) => {
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

    const absoluteProjectPath = path.resolve(options.projectDir);

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);

    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const { warehouseClient } = await getWarehouseClient({
        isDbtCloudCLI: dbtVersion.isDbtCloudCLI,
        profilesDir: options.profilesDir,
        profile: options.profile || context.profileName,
        target: options.target,
        startOfWeek: options.startOfWeek,
    });

    const compiledModelIds: string[] | undefined =
        await maybeCompileModelsAndJoins(
            { targetDir: context.targetDir },
            options,
        );
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

    GlobalState.debug(
        `> Loading lightdash project config from ${absoluteProjectPath}`,
    );

    const lightdashProjectConfig = await readAndLoadLightdashProjectConfig(
        absoluteProjectPath,
    );

    GlobalState.debug(`> Loaded lightdash project config`);

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
        lightdashProjectConfig,
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
