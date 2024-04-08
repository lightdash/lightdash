import {
    attachTypesToModels,
    convertExplores,
    DbtManifestVersion,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    isWeekDay,
    ParseError,
    WarehouseCatalog,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import inquirer from 'inquirer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getDbtContext } from '../dbt/context';
import { getDbtManifest, loadManifest } from '../dbt/manifest';
import { getModelsFromManifest } from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import { validateDbtModel } from '../dbt/validation';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { dbtCompile, DbtCompileOptions, dbtList } from './dbt/compile';
import { getDbtVersion, isSupportedDbtVersion } from './dbt/getDbtVersion';

export type CompileHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    vars: string | undefined;
    verbose: boolean;
    startOfWeek?: number;
    timezone?: string;
};

export const compile = async (options: CompileHandlerOptions) => {
    const dbtVersion = await getDbtVersion();
    const manifestVersion = await getDbtManifest();
    GlobalState.debug(`> dbt version ${dbtVersion}`);
    const executionId = uuidv4();
    await LightdashAnalytics.track({
        event: 'compile.started',
        properties: {
            executionId,
            dbtVersion,
            useDbtList: !!options.useDbtList,
            skipWarehouseCatalog: !!options.skipWarehouseCatalog,
            skipDbtCompile: !!options.skipDbtCompile,
        },
    });

    if (!isSupportedDbtVersion(dbtVersion)) {
        if (process.env.CI === 'true') {
            console.error(
                `Your dbt version ${dbtVersion} does not match our supported versions (1.3.* - 1.7.*), this could cause problems on compile or validation.`,
            );
        } else {
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `${styles.warning(
                        `Your dbt version ${dbtVersion} does not match our supported version (1.3.* - 1.7.*), this could cause problems on compile or validation.`,
                    )}\nDo you still want to continue?`,
                },
            ]);
            if (!answers.isConfirm) {
                throw new Error(`Unsupported dbt version ${dbtVersion}`);
            }
        }
    }

    // Skipping assumes manifest.json already exists.
    let compiledModelIds: string[] | undefined;
    if (options.useDbtList) {
        compiledModelIds = await dbtList(options);
    } else if (!options.skipDbtCompile) {
        await dbtCompile(options);
    } else {
        GlobalState.debug('> Skipping dbt compile');
    }

    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);

    GlobalState.debug(`> Compiling with project dir ${absoluteProjectPath}`);
    GlobalState.debug(`> Compiling with profiles dir ${absoluteProfilesPath}`);

    const context = await getDbtContext({ projectDir: absoluteProjectPath });
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
    const models = getModelsFromManifest(manifest).filter((model) => {
        if (compiledModelIds) {
            return compiledModelIds.includes(model.unique_id);
        }
        // in case they skipped the compile step, we check if the models are compiled
        return model.compiled;
    });

    const adapterType = manifest.metadata.adapter_type;

    const { valid: validModels, invalid: failedExplores } =
        await validateDbtModel(adapterType, models);

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
                dbtVersion,
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
    GlobalState.debug(`> Warehouse timezone selected ${options.timezone}`);
    const validExplores = await convertExplores(
        validModelsWithTypes,
        false,
        manifest.metadata.adapter_type,
        [DbtManifestVersion.V10, DbtManifestVersion.V11].includes(
            manifestVersion,
        )
            ? []
            : Object.values(manifest.metrics),
        warehouseClient,
        options.timezone,
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
            dbtVersion,
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
