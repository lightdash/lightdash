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
    const warehouseClient = warehouseClientFromCredentials(credentials);
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const models = getModelsFromManifest(manifest);

    const adapterType = manifest.metadata.adapter_type;

    const [validModels, failedExplores] = validateDbtModel(adapterType, models);
    if (failedExplores.length > 0) {
        const errors = failedExplores.map((failedExplore) =>
            failedExplore.errors.map((error) => `- ${error.message}\n`),
        );
        throw new ParseError(
            `Found ${failedExplores.length} errors when validating dbt model:
${errors.join('')}
            `,
        );
    } else {
        GlobalState.debug(
            `> Validated dbt models: ${validModels
                .map((m) => m.name)
                .join(', ')}`,
        );
    }

    GlobalState.debug(
        `> Models from DBT manifest: ${models.map((m) => m.name).join(', ')}`,
    );

    // Ideally we'd skip this potentially expensive step
    const catalog = await warehouseClient.getCatalog(
        getSchemaStructureFromDbtModels(models),
    );

    const typedModels = attachTypesToModels(models, catalog, false);

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

    const explores = await convertExplores(
        typedModels,
        false,
        manifest.metadata.adapter_type,
        Object.values(manifest.metrics),
        isWeekDay(options.startOfWeek) ? options.startOfWeek : undefined,
    );
    console.error('');

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
    const errors = explores.filter((e) => isExploreError(e)).length;
    console.error('');
    if (errors > 0)
        console.error(styles.warning(`Compiled project with ${errors} errors`));
    else console.error(styles.success('Successfully compiled project'));
    console.error('');
};
