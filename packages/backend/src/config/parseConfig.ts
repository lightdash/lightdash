import {
    isLightdashMode,
    LightdashMode,
    ParseError,
    SentryConfig,
} from '@lightdash/common';
import { type ClientAuthMethod } from 'openid-client';
import internal from 'stream';
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
    } catch (e) {
        throw new ParseError(
            `Cannot parse environment variable "${name}". Value must be valid JSON but ${name}=${raw}. Error: ${e.message}`,
        );
    }
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

type LoggingLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';
const assertIsLoggingLevel = (x: string): x is LoggingLevel =>
    ['error', 'warn', 'info', 'http', 'debug'].includes(x);
const parseLoggingLevel = (raw: string): LoggingLevel => {
    if (!assertIsLoggingLevel(raw)) {
        throw new ParseError(
            `Cannot parse environment variable "LIGHTDASH_LOG_LEVEL". Value must be one of "error", "warn", "info", "debug" but LIGHTDASH_LOG_LEVEL=${raw}`,
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
    security: {
        contentSecurityPolicy: {
            reportOnly: boolean;
            allowedDomains: string[];
            reportUri?: string;
        };
    };
    cookiesMaxAgeHours?: number;
    trustProxy: boolean;
    databaseConnectionUri?: string;
    smtp: SmtpConfig | undefined;
    rudder: RudderConfig;
    posthog: PosthogConfig | undefined;
    mode: LightdashMode;
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
        csvCellsLimit: number;
        timezone: string | undefined;
    };
    pivotTable: {
        maxColumnLimit: number;
    };
    chart: {
        versionHistory: {
            daysLimit: number;
        };
    };
    customVisualizations: {
        enabled: boolean;
    };
    s3?: S3Config;
    headlessBrowser: HeadlessBrowserConfig;
    resultsCache: {
        enabled: boolean;
        cacheStateTimeSeconds: number;
        s3: {
            bucket?: string;
            region?: string;
            accessKey?: string;
            secretKey?: string;
        };
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
    github: {
        appName: string;
        redirectDomain: string;
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
};
export type HeadlessBrowserConfig = {
    host?: string;
    port?: string;
    internalLightdashHost: string;
};
export type S3Config = {
    region?: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
    bucket?: string;
    expirationTime?: number;
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
    writeKey: string;
    dataPlaneUrl: string;
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

export type AuthConfig = {
    disablePasswordAuthentication: boolean;
    enableGroupSync: boolean;
    enableOidcLinking: boolean;
    enableOidcToEmailLinking: boolean;
    google: AuthGoogleConfig;
    okta: AuthOktaConfig;
    oneLogin: AuthOneLoginConfig;
    azuread: AuthAzureADConfig;
    oidc: AuthOidcConfig;
    disablePat: boolean;
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

    return {
        mode,
        security: {
            contentSecurityPolicy: {
                reportOnly: process.env.LIGHTDASH_CSP_REPORT_ONLY !== 'false', // defaults to true
                allowedDomains: (
                    process.env.LIGHTDASH_CSP_ALLOWED_DOMAINS || ''
                )
                    .split(',')
                    .map((domain) => domain.trim()),
                reportUri: process.env.LIGHTDASH_CSP_REPORT_URI,
            },
        },
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
                process.env.RUDDERSTACK_WRITE_KEY === undefined
                    ? '1vqkSlWMVtYOl70rk3QSE0v1fqY'
                    : process.env.RUDDERSTACK_WRITE_KEY,
            dataPlaneUrl:
                process.env.RUDDERSTACK_DATA_PLANE_URL ||
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
        secureCookies: process.env.SECURE_COOKIES === 'true',
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
            disablePat: process.env.DISABLE_PAT === 'true',
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
            csvCellsLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_CSV_CELLS_LIMIT',
                ) || 100000,
            timezone: process.env.LIGHTDASH_QUERY_TIMEZONE,
        },
        chart: {
            versionHistory: {
                daysLimit:
                    getIntegerFromEnvironmentVariable(
                        'LIGHTDASH_CHART_VERSION_HISTORY_DAYS_LIMIT',
                    ) || 3,
            },
        },
        customVisualizations: {
            enabled:
                process.env.CUSTOM_VISUALIZATIONS_ENABLED === 'true' || false,
        },
        pivotTable: {
            maxColumnLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_PIVOT_TABLE_MAX_COLUMN_LIMIT',
                ) || 60,
        },
        s3: {
            region: process.env.S3_REGION,
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
            bucket: process.env.S3_BUCKET,
            endpoint: process.env.S3_ENDPOINT,
            expirationTime: parseInt(
                process.env.S3_EXPIRATION_TIME || '259200', // 3 days in seconds
                10,
            ),
        },
        headlessBrowser: {
            port: process.env.HEADLESS_BROWSER_PORT,
            host: process.env.HEADLESS_BROWSER_HOST,
            internalLightdashHost:
                process.env.INTERNAL_LIGHTDASH_HOST || siteUrl,
        },
        resultsCache: {
            enabled: process.env.RESULTS_CACHE_ENABLED === 'true',
            cacheStateTimeSeconds: parseInt(
                process.env.CACHE_STALE_TIME_SECONDS || '86400', // A day in seconds
                10,
            ),
            s3: {
                bucket: process.env.RESULTS_CACHE_S3_BUCKET,
                region: process.env.RESULTS_CACHE_S3_REGION,
                accessKey: process.env.RESULTS_CACHE_S3_ACCESS_KEY,
                secretKey: process.env.RESULTS_CACHE_S3_SECRET_KEY,
            },
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
        },
        scheduler: {
            enabled: process.env.SCHEDULER_ENABLED !== 'false',
            concurrency: parseInt(process.env.SCHEDULER_CONCURRENCY || '1', 10),
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
        github: {
            appName: process.env.GITHUB_APP_NAME || 'lightdash-app-dev',
            redirectDomain:
                process.env.GITHUB_REDIRECT_DOMAIN ||
                siteUrl.split('.')[0].split('//')[1],
        },
    };
};
