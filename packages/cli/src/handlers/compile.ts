import {
    attachTypesToModels,
    convertExplores,
    getSchemaStructureFromDbtModels,
    isSupportedDbtAdapter,
    ParseError,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import path from 'path';
import { getConfig } from '../config';
import { getDbtContext } from '../dbt/context';
import { loadManifest } from '../dbt/manifest';
import { getModelsFromManifest } from '../dbt/models';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type GenerateHandlerOptions = {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};
export const compileHandler = async (options: GenerateHandlerOptions) => {
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
    const catalog = await warehouseClient.getCatalog(
        getSchemaStructureFromDbtModels(models),
    );
    const typedModels = attachTypesToModels(models, catalog, true);
    if (!isSupportedDbtAdapter(manifest.metadata)) {
        throw new ParseError('');
    }
    const explores = await convertExplores(
        typedModels,
        false,
        manifest.metadata.adapter_type,
        Object.values(manifest.metrics),
    );
    console.error(`Compiled ${explores.length} explores`);
    const config = await getConfig();
    await lightdashApi<undefined>({
        method: 'PUT',
        url: `/api/v1/projects/${config.context.project}/explores`,
        body: JSON.stringify(explores),
    });
    console.error('');
    console.error(styles.success('Successfully compiled project'));
    console.error('');
    console.error(`${styles.bold('Preview your project:')}`);
    console.error('');
    console.error(
        `      ${styles.bold(
            `⚡️ ${config.context.serverUrl}/projects/${config.context.project}/tables`,
        )}`,
    );
    console.error('');
};
