import {
    attachTypesToModels,
    convertExplores,
    DbtManifestVersion,
    getCompiledModels,
    getDbtManifestVersion,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
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
    warehouseCredentials?: boolean;
};

export const compile = async (options: CompileHandlerOptions) => {
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

    const absoluteProjectPath = path.resolve(options.projectDir);

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);

    const context = await getDbtContext({ projectDir: absoluteProjectPath });

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
        const { warehouseClient } = await getWarehouseClient({
            isDbtCloudCLI: dbtVersion.isDbtCloudCLI,
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
            : Object.values(manifest.metrics),
        warehouseSqlBuilder,
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
export const compileHandler = async (
    originalOptions: CompileHandlerOptions,
) => {
    const options = { ...originalOptions };
    if (originalOptions.warehouseCredentials === false) {
        options.skipDbtCompile = true;
        options.skipWarehouseCatalog = true;
    }
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
