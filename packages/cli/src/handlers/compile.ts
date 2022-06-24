import {
    attachTypesToModels,
    convertExplores,
    getSchemaStructureFromDbtModels,
    isExploreError,
    isSupportedDbtAdapter,
    ParseError,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import path from 'path';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { getModelsFromManifest } from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import * as styles from '../styles';

type GenerateHandlerOptions = {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};
export const compile = async (options: GenerateHandlerOptions) => {
    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const profileName = options.profile || context.profileName;
    const target = await loadDbtTarget({
        profilesDir: absoluteProfilesPath,
        profileName,
        targetName: options.target,
    });
    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const warehouseClient = warehouseClientFromCredentials(credentials);
    const manifest = await loadManifest({ targetDir: context.targetDir });
    const models = getModelsFromManifest(manifest);

    // Ideally we'd skip this potentially expensive step
    const catalog = await warehouseClient.getCatalog(
        getSchemaStructureFromDbtModels(models),
    );

    const typedModels = attachTypesToModels(models, catalog, true);
    if (!isSupportedDbtAdapter(manifest.metadata)) {
        throw new ParseError(
            `Dbt adapter ${manifest.metadata.adapter_type} is not supported`,
        );
    }
    const explores = await convertExplores(
        typedModels,
        false,
        manifest.metadata.adapter_type,
        Object.values(manifest.metrics),
    );

    return explores;
};
export const compileHandler = async (options: GenerateHandlerOptions) => {
    const explores = await compile(options);

    const hasError = explores.find(isExploreError);
    if (hasError) {
        console.error(
            styles.error(
                `There was an error when running compile on ${hasError.name}:`,
            ),
        );
        hasError.errors.forEach((e) => {
            console.error(styles.error(`${e.type}: ${e.message}`));
        });
        console.error('');
    } else {
        console.error(`Compiled ${explores.length} explores`);
        console.error('');
        console.error(styles.success('Successfully compiled project'));
        console.error('');
    }
};
