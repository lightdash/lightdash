import { isLightdashMode, LightdashMode, ParseError } from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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

export type LightdashConfigIn = {
    version: '1.0';
    mode: LightdashMode;
};

export type LightdashConfig = {
    version: '1.0';
    lightdashSecret: string;
    secureCookies: boolean;
    cookiesMaxAgeHours?: number;
    trustProxy: boolean;
    databaseConnectionUri?: string;
    smtp: SmtpConfig | undefined;
    rudder: RudderConfig;
    mode: LightdashMode;
    sentry: SentryConfig;
    auth: AuthConfig;
    cohere: CohereConfig;
    intercom: IntercomConfig;
    siteUrl: string;
    staticIp: string;
    database: {
        connectionUri: string | undefined;
        maxConnections: number | undefined;
        minConnections: number | undefined;
    };
    allowMultiOrgs: boolean;
    maxPayloadSize: string;
    query: {
        maxLimit: number;
    };
    s3?: S3Config;
    headlessBrowser?: HeadlessBrowserConfig;
    slack?: SlackConfig;
};

export type SlackConfig = {
    appToken?: string;
    port: number;
    signingSecret?: string;
    clientId?: string;
    clientSecret?: string;
    stateSecret: string;
};
export type HeadlessBrowserConfig = {
    host?: string;
    port?: string;
};
export type S3Config = {
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
    bucket?: string;
};
export type IntercomConfig = {
    appId: string;
    apiBase: string;
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

type AuthOktaConfig = {
    oauth2Issuer: string | undefined;
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    authorizationServerId: string | undefined;
    oktaDomain: string | undefined;
    callbackPath: string;
    loginPath: string;
};

export type AuthConfig = {
    disablePasswordAuthentication: boolean;
    google: AuthGoogleConfig;
    okta: AuthOktaConfig;
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

const mergeWithEnvironment = (config: LightdashConfigIn): LightdashConfig => {
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
            disablePasswordAuthentication:
                process.env.AUTH_DISABLE_PASSWORD_AUTHENTICATION === 'true',
            google: {
                oauth2ClientId: process.env.AUTH_GOOGLE_OAUTH2_CLIENT_ID,
                oauth2ClientSecret:
                    process.env.AUTH_GOOGLE_OAUTH2_CLIENT_SECRET,
                loginPath: '/login/google',
                callbackPath: '/oauth/redirect/google',
            },
            okta: {
                oauth2Issuer: process.env.AUTH_OKTA_OAUTH_ISSUER,
                oauth2ClientId: process.env.AUTH_OKTA_OAUTH_CLIENT_ID,
                oauth2ClientSecret: process.env.AUTH_OKTA_OAUTH_CLIENT_SECRET,
                authorizationServerId:
                    process.env.AUTH_OKTA_AUTHORIZATION_SERVER_ID,
                oktaDomain: process.env.AUTH_OKTA_DOMAIN,
                callbackPath: '/oauth/redirect/okta',
                loginPath: '/login/okta',
            },
        },
        intercom: {
            appId: process.env.INTERCOM_APP_ID || 'zppxyjpp',
            apiBase:
                process.env.INTERCOM_APP_BASE || 'https://api-iam.intercom.io',
        },
        cohere: {
            token: process.env.COHERE_TOKEN || '',
        },
        siteUrl,
        staticIp: process.env.STATIC_IP || '',
        allowMultiOrgs: process.env.ALLOW_MULTIPLE_ORGS === 'true',
        maxPayloadSize: process.env.LIGHTDASH_MAX_PAYLOAD || '5mb',
        query: {
            maxLimit:
                getIntegerFromEnvironmentVariable(
                    'LIGHTDASH_QUERY_MAX_LIMIT',
                ) || 5000,
        },
        s3: {
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
            bucket: process.env.S3_BUCKET,
            endpoint: process.env.S3_ENDPOINT,
        },
        headlessBrowser: {
            port: process.env.HEADLESS_BROWSER_PORT,
            host: process.env.HEADLESS_BROWSER_HOST,
        },
        slack: {
            appToken: process.env.SLACK_APP_TOKEN,
            port: parseInt(process.env.SLACK_PORT || '4351', 10),
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            clientId: process.env.SLACK_CLIENT_ID,
            clientSecret: process.env.SLACK_CLIENT_SECRET,
            stateSecret: process.env.SLACK_STATE_SECRET || 'slack-state-secret',
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
