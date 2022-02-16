import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
    DbtBitBucketProjectConfig,
    DbtCloudIDEProjectConfig,
    DbtGithubProjectConfig,
    DbtGitlabProjectConfig,
    DbtLocalProjectConfig,
    DbtProjectConfig,
    DbtProjectConfigBase,
    isLightdashMode,
    LightdashMode,
    ProjectType,
} from 'common';
import { ParseError } from '../errors';
import lightdashV1JsonSchema from '../jsonSchemas/lightdashConfig/v1.json';
import Logger from '../logger';
import { VERSION } from '../version';

export const getIntegerFromEnvironmentVariable = (
    name: string,
): number | undefined => {
    const raw = process.env[name];
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        throw new ParseError(
            `Cannot parse environment variable "${name}". Value must be an integer but ${name}=${raw}`,
        );
    }
    return parsed;
};

export type DbtProjectConfigIn<T extends DbtProjectConfig> = Partial<T> &
    DbtProjectConfigBase;

export type LightdashConfigIn = {
    version: '1.0';
    mode: LightdashMode;
    projects?: Array<Partial<DbtProjectConfig> & DbtProjectConfigBase>;
};

export type LightdashConfig = {
    version: '1.0';
    lightdashSecret: string;
    secureCookies: boolean;
    trustProxy: boolean;
    databaseConnectionUri?: string;
    smtp: SmtpConfig | undefined;
    rudder: RudderConfig;
    mode: LightdashMode;
    projects: Array<DbtProjectConfig>;
    sentry: SentryConfig;
    auth: AuthConfig;
    cohere: CohereConfig;
    chatwoot: ChatwootConfig;
    siteUrl: string;
    database: {
        connectionUri: string | undefined;
        maxConnections: number | undefined;
        minConnections: number | undefined;
    };
};

export type ChatwootConfig = {
    baseUrl: string;
    websiteToken: string;
};

type CohereConfig = {
    token: string;
};

export type SentryConfig = {
    dsn: string;
    release: string;
    environment: string;
};

export type RudderConfig = {
    writeKey: string;
    dataPlaneUrl: string;
};

export type AuthGoogleConfig = {
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    loginPath: string;
    callbackPath: string;
};

export type AuthConfig = {
    disablePasswordAuthentication: boolean;
    google: AuthGoogleConfig;
};

export type SmtpConfig = {
    host: string;
    port: number;
    secure: boolean;
    allowInvalidCertificate: boolean;
    auth: {
        user: string;
        pass: string | undefined;
        accessToken: string | undefined;
    };
    sender: {
        name: string;
        email: string;
    };
};

type ConfigKeys<T extends DbtProjectConfig> = {
    [P in keyof Required<T>]: boolean;
};
const dbtLocalProjectConfigKeys: ConfigKeys<DbtLocalProjectConfig> = {
    type: true,
    name: true,
    profiles_dir: false,
    project_dir: true,
    target: false,
};
const dbtCloudIDEProjectConfigKeys: ConfigKeys<DbtCloudIDEProjectConfig> = {
    type: true,
    name: true,
    api_key: true,
    account_id: true,
    environment_id: true,
    project_id: true,
};
const dbtGithubProjectConfigKeys: ConfigKeys<DbtGithubProjectConfig> = {
    type: true,
    name: true,
    personal_access_token: true,
    repository: true,
    branch: true,
    project_sub_path: true,
    host_domain: true,
};
const dbtGitlabProjectConfigKeys: ConfigKeys<DbtGitlabProjectConfig> = {
    type: true,
    name: true,
    personal_access_token: true,
    repository: true,
    branch: true,
    project_sub_path: true,
    host_domain: true,
};
const dbtBitBucketProjectConfigKeys: ConfigKeys<DbtBitBucketProjectConfig> = {
    type: true,
    name: true,
    username: true,
    personal_access_token: true,
    repository: true,
    branch: true,
    project_sub_path: true,
    host_domain: true,
};

const mergeProjectWithEnvironment = <T extends DbtProjectConfig>(
    projectIndex: number,
    project: DbtProjectConfigIn<T>,
    configKeys: ConfigKeys<T>,
): T =>
    Object.entries(configKeys).reduce((prev, [key, isRequired]) => {
        const envKey = `LIGHTDASH_PROJECT_${projectIndex}_${key}`.toUpperCase();
        const value = process.env[envKey] || project[key as keyof T];
        if (isRequired && value === undefined) {
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
    const mergedProjects = (config.projects || []).map((project, idx) => {
        const projectType = project.type;
        switch (project.type) {
            case ProjectType.DBT:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtLocalProjectConfigKeys,
                );
            case ProjectType.DBT_CLOUD_IDE:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtCloudIDEProjectConfigKeys,
                );
            case ProjectType.GITHUB:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtGithubProjectConfigKeys,
                );
            case ProjectType.GITLAB:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtGitlabProjectConfigKeys,
                );
            case ProjectType.BITBUCKET:
                return mergeProjectWithEnvironment(
                    idx,
                    project,
                    dbtBitBucketProjectConfigKeys,
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
    const lightdashSecret = process.env.LIGHTDASH_SECRET;
    if (!lightdashSecret) {
        throw new ParseError(
            `Must specify environment variable LIGHTDASH_SECRET. Keep this value hidden!`,
            {},
        );
    }
    const lightdashMode = process.env.LIGHTDASH_MODE;
    if (lightdashMode !== undefined && !isLightdashMode(lightdashMode)) {
        throw new ParseError(
            `Lightdash mode set by environment variable LIGHTDASH_MODE=${lightdashMode} is invalid. Must be one of ${Object.values(
                LightdashMode,
            )}`,
            {},
        );
    }

    const mode = lightdashMode || config.mode;
    const siteUrl = process.env.SITE_URL || 'http://localhost:8080';
    if (
        process.env.NODE_ENV !== 'development' &&
        siteUrl.includes('localhost')
    ) {
        Logger.warn(
            `Using ${siteUrl} as the base SITE_URL for Lightdash. This is not suitable for production. Update with a top level domain using https such as https://lightdash.mycompany.com`,
        );
    }

    return {
        ...config,
        mode,
        projects: mergedProjects,
        smtp: process.env.EMAIL_SMTP_HOST
            ? {
                  host: process.env.EMAIL_SMTP_HOST,
                  port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
                  secure: process.env.EMAIL_SMTP_SECURE !== 'false', // default to true
                  allowInvalidCertificate:
                      process.env.EMAIL_SMTP_ALLOW_INVALID_CERT === 'true',
                  auth: {
                      user: process.env.EMAIL_SMTP_USER || '',
                      pass: process.env.EMAIL_SMTP_PASSWORD,
                      accessToken: process.env.EMAIL_SMTP_ACCESS_TOKEN,
                  },
                  sender: {
                      name: process.env.EMAIL_SMTP_SENDER_NAME || 'Lightdash',
                      email: process.env.EMAIL_SMTP_SENDER_EMAIL || '',
                  },
              }
            : undefined,
        rudder: {
            writeKey:
                process.env.RUDDERSTACK_WRITE_KEY ||
                '1vqkSlWMVtYOl70rk3QSE0v1fqY',
            dataPlaneUrl:
                process.env.RUDDERSTACK_DATA_PLANE_URL ||
                'https://analytics.lightdash.com',
        },
        sentry: {
            dsn: process.env.SENTRY_DSN || '',
            release: VERSION,
            environment:
                process.env.NODE_ENV === 'development' ? 'development' : mode,
        },
        lightdashSecret,
        secureCookies: process.env.SECURE_COOKIES === 'true',
        trustProxy: process.env.TRUST_PROXY === 'true',
        database: {
            connectionUri: process.env.PGCONNECTIONURI,
            maxConnections:
                getIntegerFromEnvironmentVariable('PGMAXCONNECTIONS'),
            minConnections:
                getIntegerFromEnvironmentVariable('PGMINCONNECTIONS'),
        },
        auth: {
            disablePasswordAuthentication:
                process.env.AUTH_DISABLE_PASSWORD_AUTHENTICATION === 'true',
            google: {
                oauth2ClientId: process.env.AUTH_GOOGLE_OAUTH2_CLIENT_ID,
                oauth2ClientSecret:
                    process.env.AUTH_GOOGLE_OAUTH2_CLIENT_SECRET,
                loginPath: '/login/google',
                callbackPath: '/oauth/redirect/google',
            },
        },
        chatwoot: {
            websiteToken:
                process.env.CHATWOOT_TOKEN || 'qUs8eBDFmn9id6R8aa1pAePq',
            baseUrl:
                process.env.CHATWOOT_BASE_URL || 'https://chat.lightdash.com',
        },
        cohere: {
            token: process.env.COHERE_TOKEN || '',
        },
        siteUrl,
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
