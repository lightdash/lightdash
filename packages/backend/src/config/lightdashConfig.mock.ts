import { LightdashMode, OrganizationMemberRole } from '@lightdash/common';
import { LightdashConfig } from './parseConfig';

export const lightdashConfigMock: LightdashConfig = {
    allowMultiOrgs: false,
    auth: {
        pat: {
            enabled: false,
            allowedOrgRoles: Object.values(OrganizationMemberRole),
            maxExpirationTimeInDays: undefined,
        },
        enableGroupSync: false,
        disablePasswordAuthentication: false,
        enableOidcLinking: false,
        enableOidcToEmailLinking: false,
        google: {
            loginPath: '',
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            callbackPath: '',
            googleDriveApiKey: undefined,
            enableGCloudADC: false,
            enabled: false,
        },
        okta: {
            loginPath: '',
            oauth2Issuer: undefined,
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            authorizationServerId: undefined,
            extraScopes: undefined,
            oktaDomain: undefined,
            callbackPath: '',
        },
        oneLogin: {
            oauth2Issuer: undefined,
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            callbackPath: '',
            loginPath: '',
        },
        azuread: {
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            oauth2TenantId: undefined,
            loginPath: '',
            callbackPath: '',
            x509PublicKeyCertPath: undefined,
            x509PublicKeyCert: undefined,
            privateKeyFilePath: undefined,
            privateKeyFile: undefined,
            openIdConnectMetadataEndpoint: undefined,
        },
        oidc: {
            authMethod: undefined,
            authSigningAlg: undefined,
            callbackPath: '',
            loginPath: '',
            clientId: undefined,
            clientSecret: undefined,
            metadataDocumentEndpoint: undefined,
            privateKeyFile: undefined,
            privateKeyFilePath: undefined,
            scopes: undefined,
            x509PublicKeyCert: undefined,
            x509PublicKeyCertPath: undefined,
        },
        snowflake: {
            loginPath: '/login/snowflake',
            callbackPath: '/oauth/redirect/snowflake',
            authorizationEndpoint: undefined,
            tokenEndpoint: undefined,
            clientId: undefined,
            clientSecret: undefined,
        },
    },
    lightdashCloudInstance: 'test-instance',
    k8s: {
        podNamespace: undefined,
        podName: undefined,
        nodeName: undefined,
    },
    prometheus: {
        enabled: false,
        port: 9090,
        path: '/metrics',
    },
    chart: { versionHistory: { daysLimit: 0 } },
    database: {
        connectionUri: undefined,
        maxConnections: undefined,
        minConnections: undefined,
    },
    intercom: {
        appId: '',
        apiBase: '',
    },
    pylon: {
        appId: '',
    },
    lightdashSecret: 'look away this is a secret',
    logging: {
        level: 'debug',
        format: 'pretty',
        outputs: ['console'],
        consoleFormat: undefined,
        consoleLevel: undefined,
        fileFormat: undefined,
        fileLevel: undefined,
        filePath: '',
    },
    maxPayloadSize: '',
    pivotTable: { maxColumnLimit: 0 },
    posthog: undefined,
    s3: {
        endpoint: 'mock_endpoint',
        bucket: 'mock_bucket',
        region: 'mock_region',
    },
    results: {
        cacheStateTimeSeconds: 0,
        cacheEnabled: false,
        autocompleteEnabled: false,
        s3: {
            endpoint: 'mock_endpoint',
            bucket: 'mock_bucket',
            region: 'mock_region',
        },
    },
    rudder: {
        writeKey: '',
        dataPlaneUrl: '',
    },
    scheduler: { concurrency: 0, enabled: false, jobTimeout: 0 },
    secureCookies: false,
    sentry: {
        backend: {
            dsn: '',
            securityReportUri: '',
        },
        frontend: {
            dsn: '',
        },
        release: '',
        environment: '',
        tracesSampleRate: 0,
        profilesSampleRate: 0,
        anr: {
            enabled: false,
            captureStacktrace: false,
        },
    },
    staticIp: '',
    trustProxy: false,
    mode: LightdashMode.DEFAULT,
    license: {
        licenseKey: null,
    },
    groups: {
        enabled: false,
    },
    extendedUsageAnalytics: {
        enabled: false,
    },
    smtp: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxPageSize: 2500,
        maxLimit: 5000,
        defaultLimit: 500,
        csvCellsLimit: 100000,
        timezone: undefined,
    },
    ai: {
        copilot: {
            enabled: false,
            telemetryEnabled: false,
            requiresFeatureFlag: false,
            defaultProvider: 'openai',
            providers: {
                openai: {
                    apiKey: 'mock_api_key',
                    modelName: 'mock_model_name',
                },
            },
            embeddingSearchEnabled: false,
        },
    },
    embedding: {
        enabled: false,
    },
    scim: {
        enabled: false,
    },
    security: {
        contentSecurityPolicy: {
            reportOnly: false,
            allowedDomains: [],
            frameAncestors: [],
        },
        crossOriginResourceSharingPolicy: {
            enabled: false,
            allowedDomains: [],
        },
    },
    github: {
        appName: 'lightdash-app-dev',
        redirectDomain: 'test',
    },
    headlessBrowser: {
        internalLightdashHost: 'https://test.lightdash.cloud',
        browserEndpoint: 'ws://headless-browser:3000',
    },
    contentAsCode: {
        maxDownloads: 100,
    },
    appearance: {},
    microsoftTeams: {
        enabled: false,
    },
    serviceAccount: {
        enabled: false,
    },
    googleCloudPlatform: {
        projectId: 'test-project-id',
    },
};
