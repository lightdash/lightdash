import {
    attachTypesToModels,
    convertExplores,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    isWeekDay,
    ParseError,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import inquirer from 'inquirer';
import path from 'path';
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
import { dbtCompile, DbtCompileOptions } from './dbt/compile';
import { getDbtVersion } from './dbt/getDbtVersion';

type GenerateHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    verbose: boolean;
    startOfWeek?: number;
};

export const compile = async (options: GenerateHandlerOptions) => {
    await LightdashAnalytics.track({
        event: 'compile.started',
        properties: {},
    });

    const dbtVersion = await getDbtVersion();
    GlobalState.debug(`> DBT version ${dbtVersion}`);

    if (!dbtVersion.includes('1.3.')) {
        if (process.env.CI === 'true') {
            console.error(
                `Your DBT version ${dbtVersion} does not match our supported version (1.3.0), this could cause problems on compile or validation.`,
            );
        } else {
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `${styles.warning(
                        `Your DBT version ${dbtVersion} does not match our supported version (1.3.0), this could cause problems on compile or validation.`,
                    )}\nDo you still want to continue?`,
                },
            ]);
            if (!answers.isConfirm) {
                throw new Error(`Unsupported DBT version ${dbtVersion}`);
            }
        }
    }
    await dbtCompile(options);

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
    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const warehouseClient = warehouseClientFromCredentials({
        ...credentials,
        startOfWeek: isWeekDay(options.startOfWeek)
            ? options.startOfWeek
            : undefined,
    });
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const models = getModelsFromManifest(manifest);

    const adapterType = manifest.metadata.adapter_type;

    const { valid: validModels, invalid: failedExplores } = validateDbtModel(
        adapterType,
        models,
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

    // Ideally we'd skip this potentially expensive step
    const catalog = await warehouseClient.getCatalog(
        getSchemaStructureFromDbtModels(validModels),
    );

    const validModelsWithTypes = attachTypesToModels(
        validModels,
        catalog,
        false,
    );

    if (!isSupportedDbtAdapter(manifest.metadata)) {
        await LightdashAnalytics.track({
            event: 'compile.error',
            properties: {
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
        Object.values(manifest.metrics),
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
            explores: explores.length,
            errors,
        },
    });
    return explores;
};
export const compileHandler = async (options: GenerateHandlerOptions) => {
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
