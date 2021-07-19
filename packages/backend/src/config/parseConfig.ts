import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { LightdashMode } from 'common';
import lightdashV1JsonSchema from '../jsonSchemas/lightdashConfig/v1.json';
import { ParseError } from '../errors';

export enum ProjectType {
    DBT = 'dbt',
    DBT_REMOTE_SERVER = 'dbt_remote_server',
    DBT_CLOUD_IDE = 'dbt_cloud_ide',
}

interface DbtProjectConfigBase {
    type: ProjectType;
    name: string;
}

interface DbtLocalProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT;
    profiles_dir: string;
    project_dir: string;
    rpc_server_port: number;
}

interface DbtRemoteProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT_REMOTE_SERVER;
    name: string;
    rpc_server_host: string;
    rpc_server_port: number;
}

interface DbtCloudIDEProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT_CLOUD_IDE;
    api_key: string;
    account_id: string | number;
    environment_id: string | number;
    project_id: string | number;
}

export type DbtProjectConfig =
    | DbtLocalProjectConfig
    | DbtRemoteProjectConfig
    | DbtCloudIDEProjectConfig;

export type DbtProjectConfigIn<T extends DbtProjectConfig> = Partial<T> &
    DbtProjectConfigBase;

export type LightdashConfigIn = {
    version: '1.0';
    mode: LightdashMode;
    projects: Array<Partial<DbtProjectConfig> & DbtProjectConfigBase>;
};

export type LightdashConfig = {
    version: '1.0';
    rudder: RudderConfig;
    mode: LightdashMode;
    projects: Array<DbtProjectConfig>;
};

export type RudderConfig = {
    writeKey: string;
    dataPlaneUrl: string;
};

const dbtLocalProjectConfigRequiredFields: Array<keyof DbtLocalProjectConfig> =
    ['profiles_dir', 'project_dir', 'rpc_server_port'];
const dbtRemoteProjectConfigRequiredFields: Array<
    keyof DbtRemoteProjectConfig
> = ['rpc_server_host', 'rpc_server_port'];
const dbtCloudIdeProjectConfigRequiredFields: Array<
    keyof DbtCloudIDEProjectConfig
> = ['api_key', 'account_id', 'environment_id', 'project_id'];

const mergeProjectWithEnvironment = <T extends DbtProjectConfig>(
    projectIndex: number,
    project: DbtProjectConfigIn<T>,
    requiredField: Array<keyof T>,
): T =>
    requiredField.reduce((prev, key) => {
        const envKey = `LIGHTDASH_PROJECT_${projectIndex}_${key}`.toUpperCase();
        const value = process.env[envKey] || project[key];
        if (value === undefined) {
            throw new ParseError(
                `Lightdash config file successfully loaded but invalid: Project index: ${projectIndex} must have ${key} or environment variable ${envKey}.`,
                {},
            );
        }
        return {
            ...prev,
            [key]: value,
        };
    }, project) as T;

const mergeWithEnvironment = (config: LightdashConfigIn): LightdashConfig => {
    const mergedProjects = config.projects.map((project, idx) => {
        const projectType = project.type;
        switch (project.type) {
            case ProjectType.DBT:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtLocalProjectConfigRequiredFields,
                );
            case ProjectType.DBT_REMOTE_SERVER:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtRemoteProjectConfigRequiredFields,
                );
            case ProjectType.DBT_CLOUD_IDE:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtCloudIdeProjectConfigRequiredFields,
                );
            default: {
                const never: never = project;
                throw new ParseError(
                    `Lightdash config file successfully loaded but invalid: Project type: ${projectType} is not supported`,
                    {},
                );
            }
        }
    });
    return {
        ...config,
        projects: mergedProjects,
        rudder: {
            writeKey:
                process.env.RUDDERSTACK_WRITE_KEY ||
                '1vqkSlWMVtYOl70rk3QSE0v1fqY',
            dataPlaneUrl:
                process.env.RUDDERSTACK_DATA_PLANE_URL ||
                'https://analytics.lightdash.com',
        },
    };
};

export const parseConfig = (raw: any): LightdashConfig => {
    const ajv = new Ajv({
        schemaId: 'id',
        useDefaults: true,
        discriminator: true,
        allowUnionTypes: true,
    });
    addFormats(ajv);
    const validate = ajv.compile<LightdashConfigIn>(lightdashV1JsonSchema);
    const validated = validate(raw);
    if (!validated) {
        const lineErrorMessages = (validate.errors || [])
            .map((err) => `Field at ${err.instancePath} ${err.message}`)
            .join('\n');
        throw new ParseError(
            `Lightdash config file successfully loaded but invalid: ${lineErrorMessages}`,
            {},
        );
    }
    return mergeWithEnvironment(raw);
};
