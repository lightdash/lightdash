import {
    AnyType,
    AuthTokenPrefix,
    cleanColorArray,
    CreateDatabricksCredentials,
    DbtGithubProjectConfig,
    DbtProjectType,
    DbtVersionOption,
    DbtVersionOptionLatest,
    getErrorMessage,
    getInvalidHexColors,
    isLightdashMode,
    isOrganizationMemberRole,
    LightdashMode,
    OrganizationMemberRole,
    ParameterError,
    ParseError,
    SentryConfig,
    SupportedDbtVersions,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import * as Sentry from '@sentry/core';
import { type ClientAuthMethod } from 'openid-client';
import { isValid } from 'zod';
import { VERSION } from '../version';
import {
    aiCopilotConfigSchema,
    AiCopilotConfigSchemaType,
    DEFAULT_ANTHROPIC_MODEL_NAME,
    DEFAULT_DEFAULT_AI_PROVIDER,
    DEFAULT_OPENAI_MODEL_NAME,
} from './aiConfigSchema';

enum TokenEnvironmentVariable {
    SERVICE_ACCOUNT = 'LD_SETUP_SERVICE_ACCOUNT_TOKEN',
    PERSONAL_ACCESS_TOKEN = 'LD_SETUP_PROJECT_PAT',
}

const tokenConfigs = {
    [TokenEnvironmentVariable.SERVICE_ACCOUNT]: {
        prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
    },
    [TokenEnvironmentVariable.PERSONAL_ACCESS_TOKEN]: {
        prefix: AuthTokenPrefix.PERSONAL_ACCESS_TOKEN,
    },
};

const isApiValidToken = (tokenVar: TokenEnvironmentVariable) => {
    const { prefix } = tokenConfigs[tokenVar];
    const token = process.env[tokenVar];

    if (!token) return undefined;

    if (token.startsWith(prefix)) {
        return {
            value: token,
        };
    }

    throw new ParseError(
        `Cannot parse API token environment variable ${tokenVar}. The token needs to be prefixed with ${prefix}.`,
        { variant: 'ApiToken' },
    );
};

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

export const getFloatFromEnvironmentVariable = (
    name: string,
): number | undefined => {
    const raw = process.env[name];
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) {
        throw new ParseError(
            `Cannot parse environment variable "${name}". Value must be a float but ${name}=${raw}`,
        );
    }
    return parsed;
};

export const getFloatArrayFromEnvironmentVariable = (
    name: string,
): undefined | number[] => {
    const raw = process.env[name];
    if (!raw) {
        return undefined;
    }
    return raw.split(',').map((duration) => {
        const parsed = Number.parseFloat(duration);
        if (Number.isNaN(parsed)) {
            throw new ParseError(
                `Cannot parse environment variable "${name}". All values must be numbers and separated by commas but ${name}=${raw}`,
            );
        }
        return parsed;
    });
};

export const getObjectFromEnvironmentVariable = (
    name: string,
): undefined | object => {
    const raw = process.env[name];
    if (!raw) {
        return undefined;
    }
    try {
        return JSON.parse(raw);
    } catch (e: unknown) {
        throw new ParseError(
            `Cannot parse environment variable "${name}". Value must be valid JSON but ${name}=${raw}. Error: ${getErrorMessage(
                e,
            )}`,
        );
    }
};

const getArrayFromCommaSeparatedList = (envVar: string) => {
    const raw = process.env[envVar];
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((domain) => domain.trim())
        .filter((domain) => domain.length > 0);
};

export const getHexColorsFromEnvironmentVariable = (
    colorPalette: string | undefined,
): string[] | undefined => {
    if (!colorPalette) {
        return undefined;
    }

    const hexColors = cleanColorArray(colorPalette.split(','));

    // Validate that all colors are valid hex codes
    const invalidColors = getInvalidHexColors(hexColors);

    if (invalidColors.length > 0) {
        throw new ParseError(
            `Cannot parse environment variable "DEFAULT_COLOR_PALETTE_COLORS". All values must be valid hex colors (e.g. #FF0000) but found invalid colors: ${invalidColors.join(
                ', ',
            )}`,
        );
    }

    // Validate that there are exactly 20 colors
    if (hexColors.length !== 20) {
        throw new ParseError(
            `Cannot parse environment variable "DEFAULT_COLOR_PALETTE_COLORS". Must contain exactly 20 colors, but found ${hexColors.length} colors.`,
        );
    }

    return hexColors;
};

/**
 * Given a value, uses the arguments provided to figure out if that value
 * should be decoded as a base64 string.
 *
 * This can be used to circumvent limitations with some secret managers, or to
 * simplify passing some types of values around (e.g file contents)
 */
export const getMaybeBase64EncodedFromEnvironmentVariable = (
    stringContent: string | undefined,
    {
        decodeIfStartsWith,
        decodeUnlessStartsWith,
        stripPrefix = true,
    }: {
        decodeIfStartsWith?: string;
        decodeUnlessStartsWith?: string;
        stripPrefix?: boolean;
    } = {},
) => {
    if (!stringContent) {
        return undefined;
    }

    if (decodeIfStartsWith && decodeUnlessStartsWith) {
        throw new Error(
            'invariant: Cannot use decodeIfstartsWith and decodeUnlessStartsWith in the same check',
        );
    }

    if (
        (decodeIfStartsWith && stringContent.startsWith(decodeIfStartsWith)) ||
        (decodeUnlessStartsWith &&
            !stringContent.startsWith(decodeUnlessStartsWith))
    ) {
        /**
         * If we have a match, figure out if we also want to strip the positive
         * match string from the beginning of the content. This allows us to use
         * things like a `base64:` prefix to tag base64-encoded content, and also
         * strip it from the string to be decoded.
         */
        const contentMaybeWithoutPrefix = stripPrefix
            ? stringContent.substring(decodeIfStartsWith?.length ?? 0)
            : stringContent;

        return Buffer.from(contentMaybeWithoutPrefix, 'base64').toString(
            'utf-8',
        );
    }

    return stringContent;
};

/**
 * Minimal wrapper around getMaybeBase64EncodedFromEnvironmentVariable for PEM-encoded certificates
 * and private keys.
 */
export const getPemFileContent = (certValue: string | undefined) =>
    getMaybeBase64EncodedFromEnvironmentVariable(certValue, {
        /**
         * Use to figure out if we should potentially base64-decode PEM-encoded certificates or not,
         * as part of `private_key_jwt` configuration.
         */
        decodeUnlessStartsWith: '-----BEGIN ', // -----BEGIN CERTIFICATE | -----BEGIN PRIVATE KEY
    });

type LoggingLevel = 'error' | 'warn' | 'info' | 'http' | 'debug' | 'audit';
const assertIsLoggingLevel = (x: string): x is LoggingLevel =>
    ['error', 'warn', 'info', 'http', 'debug', 'audit'].includes(x);
const parseLoggingLevel = (raw: string): LoggingLevel => {
    if (!assertIsLoggingLevel(raw)) {
        throw new ParseError(
            `Cannot parse environment variable "LIGHTDASH_LOG_LEVEL". Value must be one of "error", "warn", "info", "debug", "audit" but LIGHTDASH_LOG_LEVEL=${raw}`,
        );
    }
    return raw;
};
type LoggingFormat = 'json' | 'plain' | 'pretty';
const assertIsLoggingFormat = (x: string): x is LoggingFormat =>
    ['json', 'plain', 'pretty'].includes(x);
const parseLoggingFormat = (raw: string): LoggingFormat => {
    if (!assertIsLoggingFormat(raw)) {
        throw new ParseError(
            `Cannot parse environment variable "LIGHTDASH_LOG_FORMAT". Value must be one of "json", "plain", "pretty" but LIGHTDASH_LOG_FORMAT=${raw}`,
        );
    }
    return raw;
};
type LoggingOutput = 'console' | 'file';
const assertIsLoggingOutput = (x: string): x is LoggingOutput =>
    ['console', 'file'].includes(x);
const parseLoggingOutput = (raw: string): LoggingOutput => {
    if (!assertIsLoggingOutput(raw)) {
        throw new ParseError(
            `Cannot parse environment variable "LIGHTDASH_LOG_OUTPUT". Value must be one of "console", "file" but LIGHTDASH_LOG_OUTPUT=${raw}`,
        );
    }
    return raw;
};
export const parseOrganizationMemberRoleArray = (
    envVarName: string,
): OrganizationMemberRole[] | undefined => {
    const raw = process.env[envVarName];
    if (raw === undefined) {
        return undefined;
    }
    return raw.split(',').map((role) => {
        if (!isOrganizationMemberRole(role)) {
            throw new ParseError(
                `Cannot parse environment variable "${envVarName}". Value must be a comma-separated list of OrganizationMemberRole but ${envVarName}=${raw}`,
            );
        }
        return role;
    });
};
const getInitialSetupConfig = (): LightdashConfig['initialSetup'] => {
    const parseEnum = <T>(
        value: string | undefined,
        enumObj?: AnyType,
    ): T | undefined => {
        if (!value) return undefined;

        const enumValues = enumObj ? Object.values(enumObj) : [];
        if (enumValues.length > 0 && !enumValues.includes(value)) {
            throw new ParameterError(
                `Invalid value "${value}". Must be one of ${enumValues.join(
                    ', ',
                )}`,
            );
        }
        return value as T;
    };

    const parseApiExpiration = (envVariable: string): Date | null => {
        const apiExpiration = process.env[envVariable];
        const apiExpirationDays = apiExpiration
            ? parseInt(apiExpiration, 10)
            : 30; // Convert to number, this might throw an error
        if (apiExpirationDays === 0) return null; // If 0, we return null, which means, no expiration
        if (Number.isNaN(apiExpirationDays)) {
            throw new ParameterError(`${envVariable} must be a valid number`);
        }
        return new Date(Date.now() + 1000 * 60 * 60 * 24 * apiExpirationDays);
    };
    const parseCompute = (): CreateDatabricksCredentials['compute'] => {
        // This is a stringified array of objects, in JSON format
        // If format is not correct, it will throw an error
        const compute = process.env.LD_SETUP_PROJECT_COMPUTE;
        if (!compute) return undefined;
        return JSON.parse(compute) as CreateDatabricksCredentials['compute'];
    };

    try {
        if (!process.env.LD_SETUP_ADMIN_EMAIL) return undefined;

        return {
            organization: {
                admin: {
                    name: process.env.LD_SETUP_ADMIN_NAME || 'Admin User',
                    email: process.env.LD_SETUP_ADMIN_EMAIL!,
                },
                emailDomain: process.env.LD_SETUP_ORGANIZATION_EMAIL_DOMAIN,
                defaultRole:
                    parseEnum<OrganizationMemberRole>(
                        process.env.LD_SETUP_ORGANIZATION_DEFAULT_ROLE,
                        OrganizationMemberRole,
                    ) || OrganizationMemberRole.VIEWER,
                name: process.env.LD_SETUP_ORGANIZATION_NAME!,
            },
            // TODO: Does this need validation as well?
            apiKey: process.env.LD_SETUP_ADMIN_API_KEY
                ? {
                      token: process.env.LD_SETUP_ADMIN_API_KEY,
                      expirationTime: parseApiExpiration(
                          'LD_SETUP_API_KEY_EXPIRATION',
                      ),
                  }
                : undefined,
            serviceAccount: isApiValidToken(
                TokenEnvironmentVariable.SERVICE_ACCOUNT,
            )
                ? {
                      token: process.env.LD_SETUP_SERVICE_ACCOUNT_TOKEN!,
                      expirationTime: parseApiExpiration(
                          'LD_SETUP_SERVICE_ACCOUNT_EXPIRATION',
                      ),
                  }
                : undefined,
            project: {
                name: process.env.LD_SETUP_PROJECT_NAME!,
                type: WarehouseTypes.DATABRICKS,
                catalog: process.env.LD_SETUP_PROJECT_CATALOG,
                database: process.env.LD_SETUP_PROJECT_SCHEMA!,
                serverHostName: process.env.LD_SETUP_PROJECT_HOST!,
                httpPath: process.env.LD_SETUP_PROJECT_HTTP_PATH!,
                personalAccessToken: isApiValidToken(
                    TokenEnvironmentVariable.PERSONAL_ACCESS_TOKEN,
                )?.value!,
                requireUserCredentials: undefined,
                startOfWeek: parseEnum<WeekDay>(
                    process.env.LD_SETUP_START_OF_WEEK,
                    WeekDay,
                ),
                compute: parseCompute(),
                dbtVersion:
                    parseEnum<SupportedDbtVersions>(
                        process.env.LD_SETUP_DBT_VERSION,
                        SupportedDbtVersions,
                    ) || DbtVersionOptionLatest.LATEST,
            },
            dbt: {
                type: DbtProjectType.GITHUB,
                authorization_method: 'personal_access_token',
                personal_access_token: process.env.LD_SETUP_GITHUB_PAT!,
                repository: process.env.LD_SETUP_GITHUB_REPOSITORY!,
                branch: process.env.LD_SETUP_GITHUB_BRANCH!,
                project_sub_path: process.env.LD_SETUP_GITHUB_PATH || '/',
                host_domain: undefined,
            },
        };
    } catch (e) {
        // If a variable is not set, we will skip the initial setup
        // log an error, but don't throw an error, to avoid blocking the backend.
        //
        // Unless it's related to API tokens, in which case we throw an error to get
        // a proper token. Otherwise, the CLI will not work and the app will be in a state
        // that needs to be recovered.
        if (e instanceof ParseError && e.data.variant === 'ApiToken') {
            throw e;
        }

        console.error('Error parsing initial setup config', e);
        return undefined;
    }
};

export const parseBaseS3Config = (): LightdashConfig['s3'] => {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    const expirationTime = parseInt(
        process.env.S3_EXPIRATION_TIME || '259200', // 3 days in seconds
        10,
    );

    if (!endpoint || !bucket || !region) {
        console.error(
            'ERROR: S3 is not configured. Missing S3_ENDPOINT, S3_BUCKET, S3_REGION, read docs for more info: https://docs.lightdash.com/self-host/customize-deployment/environment-variables',
        );
        throw new ParseError('Missing S3 configuration');
    }

    return {
        endpoint,
        bucket,
        region,
        accessKey,
        secretKey,
        expirationTime,
        forcePathStyle,
    };
};

export const parseResultsS3Config = (): LightdashConfig['results']['s3'] => {
    const baseS3Config = parseBaseS3Config();
    const {
        endpoint: baseEndpoint,
        bucket: baseBucket,
        region: baseRegion,
        accessKey: baseAccessKey,
        secretKey: baseSecretKey,
        forcePathStyle: baseForcePathStyle,
    } = baseS3Config;

    const bucket =
        process.env.RESULTS_S3_BUCKET ||
        process.env.RESULTS_CACHE_S3_BUCKET || // Deprecated
        baseBucket;
    const region =
        process.env.RESULTS_S3_REGION ||
        process.env.RESULTS_CACHE_S3_REGION || // Deprecated
        baseRegion;
    const accessKey =
        process.env.RESULTS_S3_ACCESS_KEY ||
        process.env.RESULTS_CACHE_S3_ACCESS_KEY || // Deprecated
        baseAccessKey;
    const secretKey =
        process.env.RESULTS_S3_SECRET_KEY ||
        process.env.RESULTS_CACHE_S3_SECRET_KEY || // Deprecated
        baseSecretKey;

    return {
        endpoint: baseEndpoint, // ! For now we keep reusing the S3_ENDPOINT like we have been so far, we are just going to enforce it
        forcePathStyle: baseForcePathStyle, // ! For now we keep reusing the S3_FORCE_PATH_STYLE like we have been so far, we are just going to enforce it
        bucket,
        region,
        accessKey,
        secretKey,
    };
};

export type LoggingConfig = {
    level: LoggingLevel;
    format: LoggingFormat;
    outputs: LoggingOutput[];
    consoleFormat: LoggingFormat | undefined;
    consoleLevel: LoggingLevel | undefined;
    fileFormat: LoggingFormat | undefined;
    fileLevel: LoggingLevel | undefined;
    filePath: string;
};

export type LightdashConfig = {
    lightdashSecret: string;
    secureCookies: boolean;
    cookieSameSite?: 'lax' | 'none';
    security: {
        contentSecurityPolicy: {
            reportOnly: boolean;
            allowedDomains: string[];
            reportUri?: string;
            frameAncestors: string[];
        };
        crossOriginResourceSharingPolicy: {
            enabled: boolean;
            allowedDomains: string[];
        };
    };
    cookiesMaxAgeHours?: number;
    trustProxy: boolean;
    databaseConnectionUri?: string;
    smtp: SmtpConfig | undefined;
    rudder: RudderConfig;
    posthog: PosthogConfig | undefined;
    mode: LightdashMode;
    license: {
        licenseKey: string | null;
    };
    sentry: SentryConfig;
    auth: AuthConfig;
    intercom: IntercomConfig;
    pylon: PylonConfig;
    siteUrl: string;
    staticIp: string;
    lightdashCloudInstance: string | undefined;
    k8s: {
        nodeName: string | undefined;
        podName: string | undefined;
        podNamespace: string | undefined;
    };
    prometheus: {
        enabled: boolean;
        port: string | number;
        path: string;
        prefix?: string;
        gcDurationBuckets?: number[];
        eventLoopMonitoringPrecision?: number;
        labels?: Object;
    };
    database: {
        connectionUri: string | undefined;
        maxConnections: number | undefined;
        minConnections: number | undefined;
    };
    allowMultiOrgs: boolean;
    maxPayloadSize: string;
    query: {
        maxLimit: number;
        defaultLimit: number;
        csvCellsLimit: number;
        timezone: string | undefined;
        maxPageSize: number;
    };
    pivotTable: {
        maxColumnLimit: number;
    };
    chart: {
        versionHistory: {
            daysLimit: number;
        };
    };
    // This is the override color palette for the organization
    appearance: {
        overrideColorPalette?: string[];
        overrideColorPaletteName?: string;
    };
    s3: S3Config;
    headlessBrowser: HeadlessBrowserConfig;
    results: {
        cacheEnabled: boolean;
        autocompleteEnabled: boolean;
        cacheStateTimeSeconds: number;
        s3: Omit<S3Config, 'expirationTime'>;
    };
    slack?: SlackConfig;
    scheduler: {
        enabled: boolean;
        concurrency: number;
        jobTimeout: number;
        screenshotTimeout?: number;
    };
    groups: {
        enabled: boolean;
    };
    extendedUsageAnalytics: {
        enabled: boolean;
    };
    logging: LoggingConfig;
    ai: {
        copilot: AiCopilotConfigSchemaType;
    };
    embedding: {
        enabled: boolean;
    };
    scim: {
        enabled: boolean;
    };
    serviceAccount: {
        enabled: boolean;
    };
    github: {
        appName: string;
        redirectDomain: string;
    };
    contentAsCode: {
        maxDownloads: number;
    };
    microsoftTeams: {
        enabled: boolean;
    };
    googleCloudPlatform: {
        projectId?: string;
    };

    initialSetup?: {
        organization: {
            admin: {
                email: string;
                name: string;
            };
            emailDomain?: string;
            name: string;
            defaultRole: OrganizationMemberRole;
        };
        apiKey?: {
            token: string;
            expirationTime: Date | null;
        };
        serviceAccount?: {
            token: string;
            expirationTime: Date | null;
        };
        project: CreateDatabricksCredentials & {
            name: string;
            dbtVersion: DbtVersionOption;
        };
        dbt: DbtGithubProjectConfig;
    };
};

export type SlackConfig = {
    signingSecret?: string;
    clientId?: string;
    clientSecret?: string;
    stateSecret: string;
    appToken?: string;
    port: number;
    socketMode?: boolean;
    channelsCachedTime: number;
    supportUrl: string;
};
export type HeadlessBrowserConfig = {
    host?: string;
    port?: string;
    internalLightdashHost: string;
    browserEndpoint: string;
};
export type S3Config = {
    region: string;
    endpoint: string;
    bucket: string;
    expirationTime?: number;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
};
export type IntercomConfig = {
    appId: string;
    apiBase: string;
};

type PylonConfig = {
    appId: string;
    identityVerificationSecret?: string;
};

export type RudderConfig = {
    writeKey: string | undefined;
    dataPlaneUrl: string | undefined;
};

export type PosthogConfig = {
    projectApiKey: string;
    feApiHost: string;
    beApiHost: string;
};

type JwtKeySetConfig = {
    /**
     * Path or content of the x509 pem-encoded public key certificate for use as part of
     * private_key_jwt token auth,
     */
    x509PublicKeyCertPath: string | undefined;
    x509PublicKeyCert: string | undefined;

    /**
     * Path or content of the private key file used as part of private_key_jwt. Must be a
     * valid key for x509PublicKeyCert[Path] defined above.
     */
    privateKeyFilePath: string | undefined;
    privateKeyFile: string | undefined;
};

export type AuthAzureADConfig = {
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    oauth2TenantId: string | undefined;
    loginPath: string;
    callbackPath: string;

    /**
     * OpenID Connect metadata endpoint, available under the Azure application's
     * Endpoints section.
     *
     * Inferred from the tenantID, if not specified (and the tenantID is available)
     */
    openIdConnectMetadataEndpoint: string | undefined;
} & JwtKeySetConfig;

export type AuthGoogleConfig = {
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    loginPath: string;
    callbackPath: string;
    googleDriveApiKey: string | undefined;
    enabled: boolean;
    enableGCloudADC: boolean;
};

type AuthOktaConfig = {
    oauth2Issuer: string | undefined;
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    authorizationServerId: string | undefined;
    extraScopes: string | undefined;
    oktaDomain: string | undefined;
    callbackPath: string;
    loginPath: string;
};

type AuthOneLoginConfig = {
    oauth2Issuer: string | undefined;
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    callbackPath: string;
    loginPath: string;
};

type AuthOidcConfig = {
    callbackPath: string;
    loginPath: string;
    clientId: string | undefined;
    clientSecret: string | undefined;
    metadataDocumentEndpoint: string | undefined;
    authSigningAlg: string | undefined;
    authMethod: ClientAuthMethod | undefined;
    scopes: string | undefined;
} & JwtKeySetConfig;

type AuthSnowflakeConfig = {
    clientId: string | undefined;
    clientSecret: string | undefined;
    authorizationEndpoint: string | undefined;
    tokenEndpoint: string | undefined;
    callbackPath: string;
    loginPath: string;
};

export type AuthConfig = {
    disablePasswordAuthentication: boolean;
    /**
     * @deprecated Group Sync is deprecated. https://github.com/lightdash/lightdash/issues/12430
     */
    enableGroupSync: boolean;
    enableOidcLinking: boolean;
    enableOidcToEmailLinking: boolean;
    google: AuthGoogleConfig;
    okta: AuthOktaConfig;
    oneLogin: AuthOneLoginConfig;
    azuread: AuthAzureADConfig;
    oidc: AuthOidcConfig;
    snowflake: AuthSnowflakeConfig;
    pat: {
        enabled: boolean;
        allowedOrgRoles: OrganizationMemberRole[];
        maxExpirationTimeInDays: number | undefined;
    };
};

export type SmtpConfig = {
    host: string;
    port: number;
    secure: boolean;
    allowInvalidCertificate: boolean;
    useAuth: boolean;
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

const DEFAULT_JOB_TIMEOUT = 1000 * 60 * 10; // 10 minutes

export const parseConfig = (): LightdashConfig => {
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

    const mode = lightdashMode || LightdashMode.DEFAULT;

    const siteUrl = process.env.SITE_URL || 'http://localhost:8080';
    if (
        process.env.NODE_ENV !== 'development' &&
        siteUrl.includes('localhost')
    ) {
        console.log(
            `WARNING: Using ${siteUrl} as the base SITE_URL for Lightdash. This is not suitable for production. Update with a top-level domain using https such as https://lightdash.mycompany.com`,
        );
    }

    const iframeAllowedDomains = getArrayFromCommaSeparatedList(
        'LIGHTDASH_IFRAME_EMBEDDING_DOMAINS',
    );
    const corsAllowedDomains = getArrayFromCommaSeparatedList(
        'LIGHTDASH_CORS_ALLOWED_DOMAINS',
    );
    const iframeEmbeddingEnabled = iframeAllowedDomains.length > 0;
    const corsEnabled = process.env.LIGHTDASH_CORS_ENABLED === 'true';
    const secureCookies = process.env.SECURE_COOKIES === 'true';
    const useSecureBrowser = process.env.USE_SECURE_BROWSER === 'true';
    const browserProtocol = useSecureBrowser ? 'wss' : 'ws';
    const browserEndpoint = useSecureBrowser
        ? `${browserProtocol}://${process.env.HEADLESS_BROWSER_HOST}`
        : `${browserProtocol}://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;

    if (iframeEmbeddingEnabled && !secureCookies) {
        throw new ParameterError(
            'To enable iframe embedding, SECURE_COOKIES must be set to true',
        );
    }

    const rawCopilotConfig = {
        enabled: process.env.AI_COPILOT_ENABLED === 'true',
        telemetryEnabled: process.env.AI_COPILOT_TELEMETRY_ENABLED === 'true',
        requiresFeatureFlag:
            process.env.AI_COPILOT_REQUIRES_FEATURE_FLAG === 'true',
        embeddingSearchEnabled:
            process.env.AI_COPILOT_EMBEDDING_SEARCH_ENABLED === 'true',
        defaultProvider:
            process.env.AI_DEFAULT_PROVIDER || DEFAULT_DEFAULT_AI_PROVIDER,
        providers: {
            azure: process.env.AZURE_AI_API_KEY
                ? {
                      endpoint: process.env.AZURE_AI_ENDPOINT,
                      apiKey: process.env.AZURE_AI_API_KEY,
                      apiVersion: process.env.AZURE_AI_API_VERSION,
                      deploymentName: process.env.AZURE_AI_DEPLOYMENT_NAME,
                  }
                : undefined,
            openai: process.env.OPENAI_API_KEY
                ? {
                      apiKey: process.env.OPENAI_API_KEY,
                      modelName:
                          process.env.OPENAI_MODEL_NAME ||
                          DEFAULT_OPENAI_MODEL_NAME,
                      baseUrl: process.env.OPENAI_BASE_URL,
                  }
                : undefined,
            anthropic: process.env.ANTHROPIC_API_KEY
                ? {
                      apiKey: process.env.ANTHROPIC_API_KEY,
                      modelName:
                          process.env.ANTHROPIC_MODEL_NAME ||
                          DEFAULT_ANTHROPIC_MODEL_NAME,
                  }
                : undefined,
        },
    };

    const copilotConfigParse =
        aiCopilotConfigSchema.safeParse(rawCopilotConfig);

    let copilotConfig: AiCopilotConfigSchemaType;
    if (!copilotConfigParse.success) {
        copilotConfig = rawCopilotConfig as AiCopilotConfigSchemaType;
        Sentry.captureException(copilotConfigParse.error);
        console.error(
            `Invalid AI copilot configuration: ${copilotConfigParse.error.message}`,
        );
    } else {
        copilotConfig = copilotConfigParse.data;
    }

    return {
        mode,
        cookieSameSite: iframeEmbeddingEnabled ? 'none' : 'lax',
        license: {
            licenseKey: process.env.LIGHTDASH_LICENSE_KEY || null,
        },
        security: {
            contentSecurityPolicy: {
                reportOnly: process.env.LIGHTDASH_CSP_REPORT_ONLY !== 'false', // defaults to true
                allowedDomains: getArrayFromCommaSeparatedList(
                    'LIGHTDASH_CSP_ALLOWED_DOMAINS',
                ),
                frameAncestors: iframeEmbeddingEnabled
                    ? iframeAllowedDomains
                    : [],
                reportUri: process.env.LIGHTDASH_CSP_REPORT_URI,
            },
            crossOriginResourceSharingPolicy: {
                enabled: corsEnabled,
                allowedDomains: corsEnabled ? corsAllowedDomains : [],
            },
        },
        smtp: process.env.EMAIL_SMTP_HOST
            ? {
                  host: process.env.EMAIL_SMTP_HOST,
                  port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
                  secure: process.env.EMAIL_SMTP_SECURE !== 'false', // defaults to true
                  allowInvalidCertificate:
                      process.env.EMAIL_SMTP_ALLOW_INVALID_CERT === 'true',
                  useAuth: process.env.EMAIL_SMTP_USE_AUTH !== 'false', // defaults to true
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
        posthog: process.env.POSTHOG_PROJECT_API_KEY
            ? {
                  projectApiKey: process.env.POSTHOG_PROJECT_API_KEY,
                  feApiHost:
                      process.env.POSTHOG_FE_API_HOST ||
                      'https://us.i.posthog.com',
                  beApiHost:
                      process.env.POSTHOG_BE_API_HOST ||
                      'https://us.i.posthog.com',
              }
            : undefined,
        rudder: {
            writeKey:
                process.env.RUDDERSTACK_ANALYTICS_DISABLED === 'true'
                    ? undefined
                    : process.env.RUDDERSTACK_WRITE_KEY ||
                      '1vqkSlWMVtYOl70rk3QSE0v1fqY',
            dataPlaneUrl:
                process.env.RUDDERSTACK_ANALYTICS_DISABLED === 'true'
                    ? undefined
                    : process.env.RUDDERSTACK_DATA_PLANE_URL ||
                      'https://analytics.lightdash.com',
        },
        sentry: {
            backend: {
                dsn: process.env.SENTRY_BE_DSN || process.env.SENTRY_DSN || '',
                securityReportUri:
                    process.env.SENTRY_BE_SECURITY_REPORT_URI || '',
            },
            frontend: {
                dsn: process.env.SENTRY_FE_DSN || process.env.SENTRY_DSN || '',
            },
            release: VERSION,
            environment:
                process.env.NODE_ENV === 'development' ? 'development' : mode,
            tracesSampleRate:
                getFloatFromEnvironmentVariable('SENTRY_TRACES_SAMPLE_RATE') ||
                0.1,
            profilesSampleRate:
                getFloatFromEnvironmentVariable(
                    'SENTRY_PROFILES_SAMPLE_RATE',
                ) || 0.2,
            anr: {
                enabled: process.env.SENTRY_ANR_ENABLED === 'true',
                captureStacktrace:
                    process.env.SENTRY_ANR_CAPTURE_STACKTRACE === 'true',
                timeout:
                    getIntegerFromEnvironmentVariable('SENTRY_ANR_TIMEOUT'),
            },
        },
        lightdashSecret,
        secureCookies,
        cookiesMaxAgeHours: getIntegerFromEnvironmentVariable(
            'COOKIES_MAX_AGE_HOURS',
        ),
        trustProxy: process.env.TRUST_PROXY === 'true',
        database: {
            connectionUri: process.env.PGCONNECTIONURI,
            maxConnections:
                getIntegerFromEnvironmentVariable('PGMAXCONNECTIONS'),
            minConnections:
                getIntegerFromEnvironmentVariable('PGMINCONNECTIONS'),
        },
        auth: {
            pat: {
                enabled: process.env.DISABLE_PAT !== 'true',
                allowedOrgRoles:
                    parseOrganizationMemberRoleArray('PAT_ALLOWED_ORG_ROLES') ??
                    Object.values(OrganizationMemberRole),
                maxExpirationTimeInDays:
                    getIntegerFromEnvironmentVariable(
                        'PAT_MAX_EXPIRATION_TIME_IN_DAYS',
                    ) ?? undefined,
            },
            disablePasswordAuthentication:
                process.env.AUTH_DISABLE_PASSWORD_AUTHENTICATION === 'true',
            enableGroupSync: process.env.AUTH_ENABLE_GROUP_SYNC === 'true',
            enableOidcLinking: process.env.AUTH_ENABLE_OIDC_LINKING === 'true',
            enableOidcToEmailLinking:
                process.env.AUTH_ENABLE_OIDC_TO_EMAIL_LINKING === 'true',
            google: {
                oauth2ClientId: process.env.AUTH_GOOGLE_OAUTH2_CLIENT_ID,
                oauth2ClientSecret:
                    process.env.AUTH_GOOGLE_OAUTH2_CLIENT_SECRET,
                loginPath: '/login/google',
                callbackPath: '/oauth/redirect/google',
                googleDriveApiKey: process.env.GOOGLE_DRIVE_API_KEY,
                enabled: process.env.AUTH_GOOGLE_ENABLED === 'true',
                enableGCloudADC: process.env.AUTH_ENABLE_GCLOUD_ADC === 'true',
            },
            okta: {
                oauth2Issuer: process.env.AUTH_OKTA_OAUTH_ISSUER,
                oauth2ClientId: process.env.AUTH_OKTA_OAUTH_CLIENT_ID,
                oauth2ClientSecret: process.env.AUTH_OKTA_OAUTH_CLIENT_SECRET,
                authorizationServerId:
                    process.env.AUTH_OKTA_AUTHORIZATION_SERVER_ID,
                extraScopes: process.env.AUTH_OKTA_EXTRA_SCOPES,
                oktaDomain: process.env.AUTH_OKTA_DOMAIN,
                callbackPath: '/oauth/redirect/okta',
                loginPath: '/login/okta',
            },
            oneLogin: {
                oauth2Issuer: process.env.AUTH_ONE_LOGIN_OAUTH_ISSUER,
                oauth2ClientId: process.env.AUTH_ONE_LOGIN_OAUTH_CLIENT_ID,
                oauth2ClientSecret:
                    process.env.AUTH_ONE_LOGIN_OAUTH_CLIENT_SECRET,
                callbackPath: '/oauth/redirect/oneLogin',
                loginPath: '/login/oneLogin',
            },
            azuread: {
                oauth2ClientId: process.env.AUTH_AZURE_AD_OAUTH_CLIENT_ID,
                oauth2ClientSecret:
                    process.env.AUTH_AZURE_AD_OAUTH_CLIENT_SECRET,
                oauth2TenantId: process.env.AUTH_AZURE_AD_OAUTH_TENANT_ID,
                callbackPath: '/oauth/redirect/azuread',
                loginPath: '/login/azuread',
                x509PublicKeyCertPath: process.env.AUTH_AZURE_AD_X509_CERT_PATH,
                x509PublicKeyCert: getPemFileContent(
                    process.env.AUTH_AZURE_AD_X509_CERT,
                ),
                privateKeyFilePath: process.env.AUTH_AZURE_AD_PRIVATE_KEY_PATH,
                privateKeyFile: getPemFileContent(
                    process.env.AUTH_AZURE_AD_PRIVATE_KEY,
                ),
                openIdConnectMetadataEndpoint:
                    process.env.AUTH_AZURE_AD_OIDC_METADATA_ENDPOINT ||
                    process.env.AUTH_AZURE_AD_OAUTH_TENANT_ID
                        ? `https://login.microsoftonline.com/${process.env.AUTH_AZURE_AD_OAUTH_TENANT_ID}/v2.0/.well-known/openid-configuration`
                        : undefined,
            },
            oidc: {
                callbackPath: '/oauth/redirect/oidc',
                loginPath: '/login/oidc',
                clientId: process.env.AUTH_OIDC_CLIENT_ID,
                clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
                metadataDocumentEndpoint:
                    process.env.AUTH_OIDC_METADATA_DOCUMENT_URL,
                x509PublicKeyCertPath: process.env.AUTH_OIDC_X509_CERT_PATH,
                x509PublicKeyCert: getPemFileContent(
                    process.env.AUTH_OIDC_X509_CERT,
                ),
                privateKeyFilePath: process.env.AUTH_OIDC_PRIVATE_KEY_PATH,
                privateKeyFile: getPemFileContent(
                    process.env.AUTH_OIDC_PRIVATE_KEY,
                ),
                authSigningAlg:
                    process.env.AUTH_OIDC_AUTH_SIGNING_ALG || 'RS256',
                authMethod:
                    (process.env.AUTH_OIDC_AUTH_METHOD as ClientAuthMethod) ||
                    'client_secret_basic',
                scopes: process.env.AUTH_OIDC_SCOPES,
            },
            snowflake: {
                clientId: process.env.SNOWFLAKE_OAUTH_CLIENT_ID,
                clientSecret: process.env.SNOWFLAKE_OAUTH_CLIENT_SECRET,
                authorizationEndpoint:
                    process.env.SNOWFLAKE_OAUTH_AUTHORIZATION_ENDPOINT,
                tokenEndpoint: process.env.SNOWFLAKE_OAUTH_TOKEN_ENDPOINT,
                loginPath: '/login/snowflake',
                callbackPath: '/oauth/redirect/snowflake',
            },
        },
        intercom: {
            appId:
                process.env.INTERCOM_APP_ID === undefined
                    ? 'zppxyjpp'
                    : process.env.INTERCOM_APP_ID,
            apiBase:
                process.env.INTERCOM_APP_BASE || 'https://api-iam.intercom.io',
        },
        pylon: {
            appId: process.env.PYLON_APP_ID || '',
            identityVerificationSecret:
                process.env.PYLON_IDENTITY_VERIFICATION_SECRET,
        },
        siteUrl,
        staticIp: process.env.STATIC_IP || '',
        lightdashCloudInstance: process.env.LIGHTDASH_CLOUD_INSTANCE,
        k8s: {
            nodeName: process.env.K8S_NODE_NAME,
            podName: process.env.K8S_POD_NAME,
            podNamespace: process.env.K8S_POD_NAMESPACE,
        },
        prometheus: {
            enabled: process.env.LIGHTDASH_PROMETHEUS_ENABLED === 'true',
            port:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_PROMETHEUS_PORT',
                ) ?? 9090,
            path: process.env.LIGHTDASH_PROMETHEUS_PATH || '/metrics',
            prefix: process.env.LIGHTDASH_PROMETHEUS_PREFIX,
            gcDurationBuckets: getFloatArrayFromEnvironmentVariable(
                'LIGHTDASH_GC_DURATION_BUCKETS',
            ),
            eventLoopMonitoringPrecision: getIntegerFromEnvironmentVariable(
                'LIGHTDASH_EVENT_LOOP_MONITORING_PRECISION',
            ),
            labels: getObjectFromEnvironmentVariable(
                'LIGHTDASH_PROMETHEUS_LABELS',
            ),
        },
        allowMultiOrgs: process.env.ALLOW_MULTIPLE_ORGS === 'true',
        maxPayloadSize: process.env.LIGHTDASH_MAX_PAYLOAD || '5mb',
        query: {
            maxLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_QUERY_MAX_LIMIT',
                ) || 5000,
            defaultLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_QUERY_DEFAULT_LIMIT',
                ) || 500,
            csvCellsLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_CSV_CELLS_LIMIT',
                ) || 100000,
            timezone: process.env.LIGHTDASH_QUERY_TIMEZONE,
            maxPageSize:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_QUERY_MAX_PAGE_SIZE',
                ) || 2500, // Defaults to default limit * 5
        },
        chart: {
            versionHistory: {
                daysLimit:
                    getIntegerFromEnvironmentVariable(
                        'LIGHTDASH_CHART_VERSION_HISTORY_DAYS_LIMIT',
                    ) || 3,
            },
        },
        pivotTable: {
            maxColumnLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_PIVOT_TABLE_MAX_COLUMN_LIMIT',
                ) || 60,
        },
        headlessBrowser: {
            port: process.env.HEADLESS_BROWSER_PORT,
            host: process.env.HEADLESS_BROWSER_HOST,
            internalLightdashHost:
                process.env.INTERNAL_LIGHTDASH_HOST || siteUrl,
            browserEndpoint,
        },
        s3: parseBaseS3Config(),
        results: {
            cacheEnabled: process.env.RESULTS_CACHE_ENABLED === 'true',
            autocompleteEnabled:
                process.env.AUTOCOMPLETE_CACHE_ENABLED === 'true',
            cacheStateTimeSeconds: parseInt(
                process.env.CACHE_STALE_TIME_SECONDS || '86400', // A day in seconds
                10,
            ),
            s3: parseResultsS3Config(),
        },
        slack: {
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            clientId: process.env.SLACK_CLIENT_ID,
            clientSecret: process.env.SLACK_CLIENT_SECRET,
            stateSecret: process.env.SLACK_STATE_SECRET || 'slack-state-secret',
            appToken: process.env.SLACK_APP_TOKEN,
            port: parseInt(process.env.SLACK_PORT || '4351', 10),
            socketMode: process.env.SLACK_SOCKET_MODE === 'true',
            channelsCachedTime: parseInt(
                process.env.SLACK_CHANNELS_CACHED_TIME || '600000',
                10,
            ), // 10 minutes
            supportUrl: process.env.SLACK_SUPPORT_URL || '',
        },
        scheduler: {
            enabled: process.env.SCHEDULER_ENABLED !== 'false',
            concurrency: parseInt(process.env.SCHEDULER_CONCURRENCY || '3', 10),
            jobTimeout: process.env.SCHEDULER_JOB_TIMEOUT
                ? parseInt(process.env.SCHEDULER_JOB_TIMEOUT, 10)
                : DEFAULT_JOB_TIMEOUT,
            screenshotTimeout: process.env.SCHEDULER_SCREENSHOT_TIMEOUT
                ? parseInt(process.env.SCHEDULER_SCREENSHOT_TIMEOUT, 10)
                : undefined,
        },
        groups: {
            enabled: process.env.GROUPS_ENABLED === 'true',
        },
        extendedUsageAnalytics: {
            enabled: process.env.EXTENDED_USAGE_ANALYTICS === 'true',
        },
        logging: {
            level: parseLoggingLevel(
                process.env.LIGHTDASH_LOG_LEVEL ||
                    ((process.env.NODE_ENV || 'development') === 'development'
                        ? 'debug'
                        : 'http'),
            ),
            format: parseLoggingFormat(
                process.env.LIGHTDASH_LOG_FORMAT || 'pretty',
            ),
            outputs: (process.env.LIGHTDASH_LOG_OUTPUTS
                ? process.env.LIGHTDASH_LOG_OUTPUTS.split(',')
                : ['console']
            ).map(parseLoggingOutput),
            consoleFormat:
                process.env.LIGHTDASH_LOG_CONSOLE_FORMAT === undefined
                    ? undefined
                    : parseLoggingFormat(
                          process.env.LIGHTDASH_LOG_CONSOLE_FORMAT,
                      ),
            consoleLevel:
                process.env.LIGHTDASH_LOG_CONSOLE_LEVEL === undefined
                    ? undefined
                    : parseLoggingLevel(
                          process.env.LIGHTDASH_LOG_CONSOLE_LEVEL,
                      ),
            fileFormat:
                process.env.LIGHTDASH_LOG_FILE_FORMAT === undefined
                    ? undefined
                    : parseLoggingFormat(process.env.LIGHTDASH_LOG_FILE_FORMAT),
            fileLevel:
                process.env.LIGHTDASH_LOG_FILE_LEVEL === undefined
                    ? undefined
                    : parseLoggingLevel(process.env.LIGHTDASH_LOG_FILE_LEVEL),
            filePath: process.env.LIGHTDASH_LOG_FILE_PATH || './logs/all.log',
        },
        ai: {
            copilot: copilotConfig,
        },
        embedding: {
            enabled: process.env.EMBEDDING_ENABLED === 'true',
        },
        scim: {
            enabled: process.env.SCIM_ENABLED === 'true',
        },
        serviceAccount: {
            enabled: process.env.SERVICE_ACCOUNT_ENABLED === 'true',
        },
        github: {
            appName: process.env.GITHUB_APP_NAME || 'lightdash-app-dev',
            redirectDomain:
                process.env.GITHUB_REDIRECT_DOMAIN ||
                siteUrl.split('.')[0].split('//')[1],
        },
        contentAsCode: {
            maxDownloads:
                getIntegerFromEnvironmentVariable('MAX_DOWNLOADS_AS_CODE') ||
                100,
        },
        appearance: {
            overrideColorPalette: getHexColorsFromEnvironmentVariable(
                process.env.OVERRIDE_COLOR_PALETTE_COLORS || undefined,
            ),
            // not required if overrideColorPalette is set
            overrideColorPaletteName: process.env.OVERRIDE_COLOR_PALETTE_NAME,
        },
        microsoftTeams: {
            enabled: process.env.MICROSOFT_TEAMS_ENABLED === 'true',
        },
        googleCloudPlatform: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        },
        initialSetup: getInitialSetupConfig(),
    };
};
