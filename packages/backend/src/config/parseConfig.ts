import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import lightdashV1JsonSchema from '../jsonSchemas/lightdashConfig/v1.json';
import { ParseError } from '../errors';

type DbtLocalProjectConfigIn = {
    type: 'dbt';
    name: string;
    profiles_dir?: string;
    project_dir?: string;
    rpc_server_port?: number;
};

type DbtLocalProjectConfig = {
    type: 'dbt';
    name: string;
    profiles_dir: string;
    project_dir: string;
    rpc_server_port: number;
};

type DbtRemoteProjectConfigIn = {
    type: 'dbt_remote_server';
    name: string;
    rpc_server_host?: string;
    rpc_server_port?: number;
};

type DbtRemoteProjectConfig = {
    type: 'dbt_remote_server';
    name: string;
    rpc_server_host: string;
    rpc_server_port: number;
};

export type DbtProjectConfig = DbtLocalProjectConfig | DbtRemoteProjectConfig;

type LightdashConfigIn = {
    version: '1.0';
    projects: Array<DbtLocalProjectConfigIn | DbtRemoteProjectConfigIn>;
};

export type LightdashConfig = {
    version: '1.0';
    projects: Array<DbtProjectConfig>;
};

const mergeWithEnvironment = (config: LightdashConfigIn): LightdashConfig => {
    const mergedProjects = config.projects.map((project, idx) => {
        const keys = Object.keys(project) as Array<keyof typeof project>;
        return keys.reduce((prev, key) => {
            const envKey = `LIGHTDASH_PROJECT_${idx}_${key}`.toUpperCase();
            const value = process.env[envKey] || project[key];
            if (value === undefined) {
                throw new ParseError(
                    `Lightdash config file successfully loaded but invalid: Project index: ${idx} must have ${key} or environment variable ${envKey}.`,
                    {},
                );
            }
            return {
                ...prev,
                [key]: value,
            };
        }, {}) as DbtProjectConfig;
    });
    return {
        ...config,
        projects: mergedProjects,
    };
};

export const parseConfig = (raw: any): LightdashConfig => {
    const ajv = new Ajv({
        schemaId: 'id',
        useDefaults: true,
        discriminator: true,
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
