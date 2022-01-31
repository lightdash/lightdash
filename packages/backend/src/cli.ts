import { CreatePostgresCredentials, WarehouseTypes } from 'common';
import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { warehouseClientFromCredentials } from './services/warehouseClients/warehouseClientFromCredentials';
import { WarehouseClient } from './types';

type CredentialsFromProfileArgs = {
    profileDir: string | undefined;
    profileName: string;
    targetName: string | undefined;
};
const credentialsFromProfile = ({
    profileName,
    targetName,
    profileDir = '~/.dbt',
}: CredentialsFromProfileArgs): CreatePostgresCredentials => {
    const profilesFilename = path.join(profileDir, 'profiles.yml');
    const profiles = yaml.load(
        readFileSync(profilesFilename, { encoding: 'utf-8' }),
    ) as any;
    const defaultTargetName = profiles[profileName]?.target as string;
    const profile = profiles[profileName]?.[targetName || defaultTargetName];
    const credentials: CreatePostgresCredentials = {
        type: WarehouseTypes.POSTGRES,
        host: profile.host,
        port: profile.port,
        user: profile.user,
        password: profile.password,
        dbname: profile.database,
        schema: profile.schema,
        threads: 1,
    };
    return credentials;
};

type LoadProjectConfigArgs = {
    projectDir?: string | undefined;
};
const loadProjectConfig = ({ projectDir = '.' }: LoadProjectConfigArgs) => {
    const projectFilename = path.join(projectDir, 'dbt_project.yml');
    const config = yaml.load(
        readFileSync(projectFilename, { encoding: 'utf-8' }),
    ) as any;
    const targetSubDir = config['target-path'] || './target';
    const targetDir = path.join(projectDir, targetSubDir);
    const modelsSubDir = config['models-path'] || './models';
    const modelsDir = path.join(projectDir, modelsSubDir);
    return {
        projectName: config.name as string,
        profileName: config.profile as string,
        targetDir,
        modelsDir,
    };
};

type LoadManifestArgs = {
    targetDir: string;
};
const loadManifest = ({ targetDir }: LoadManifestArgs) => {
    const filename = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(
        readFileSync(filename, { encoding: 'utf-8' }),
    ) as any;
    return manifest;
};

type GetModelLocationArgs = {
    projectName: string;
    manifest: any;
    modelName: string;
};
const getModelLocation = ({
    projectName,
    manifest,
    modelName,
}: GetModelLocationArgs) => {
    const modelId = `${projectName.toLowerCase().split(' ').join('_')}.models.${
        modelName.toLowerCase().split(' ')[0]
    }`;
    const model = manifest.nodes[modelId];
    return {
        database: model.database,
        schema: model.schema,
        table: model.name,
    };
};

type GetTableColumnsArgs = {
    warehouseClient: WarehouseClient;
    database: string;
    schema: string;
    table: string;
};
const getTableColumns = async ({
    warehouseClient,
    database,
    schema,
    table,
}: GetTableColumnsArgs) => {
    const catalog = await warehouseClient.getCatalog([
        { database, schema, table, columns: [] },
    ]);
    return catalog[database][schema][table];
};

type GenerateLightdashModelArgs = {
    modelName: string;
    columns: Record<string, string>;
};
const generateLightdashModel = ({
    modelName,
    columns,
}: GenerateLightdashModelArgs) => ({
    models: [
        {
            name: modelName,
            description: '',
            columns: Object.entries(columns).map(
                ([columnName, columnType]) => ({
                    name: columnName,
                    description: '',
                    meta: {
                        lightdash: {
                            metrics: {
                                [`${columnName.toLowerCase()}_sum`]: {
                                    type: 'sum',
                                },
                            },
                        },
                    },
                }),
            ),
        },
    ],
});

type WriteModelArgs = {
    model: any;
    modelName: string;
    modelsDir: string;
};
const writeModel = ({ model, modelName, modelsDir }: WriteModelArgs) => {
    const fileName = path.join(modelsDir, `${modelName}.yml`);
    writeFileSync(fileName, yaml.dump(model));
};

const doATing = async () => {
    const projectDir = undefined;
    const targetName = undefined;
    const profileDir = undefined;
    const modelName = 'users';
    const { profileName, targetDir, projectName, modelsDir } =
        loadProjectConfig({
            projectDir,
        });
    const credentials = credentialsFromProfile({
        profileName,
        targetName,
        profileDir,
    });
    const manifest = loadManifest({ targetDir });
    const modelLocation = getModelLocation({
        projectName,
        manifest,
        modelName,
    });
    const warehouseClient = warehouseClientFromCredentials(credentials);
    const columns = await getTableColumns({
        warehouseClient,
        ...modelLocation,
    });
    const model = generateLightdashModel({ modelName, columns });
    writeModel({ model, modelName, modelsDir });
};

doATing()
    .then(() => console.log('done'))
    .catch((e) => console.error(e));
