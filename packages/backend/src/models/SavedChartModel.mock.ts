import {
    ConditionalOperator,
    CreateBigqueryCredentials,
    DbtCloudIDEProjectConfig,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DimensionType,
    Explore,
    FieldType,
    LightdashMode,
    MetricFilterRule,
    MetricType,
    OrderFieldsByStrategy,
    Project,
    ProjectType,
    SupportedDbtAdapter,
    TablesConfiguration,
    TableSelectionType,
    WarehouseTypes,
} from '@lightdash/common';
import { LightdashConfig } from '../config/parseConfig';

export const lightdashConfigMock: LightdashConfig = {
    mode: LightdashMode.DEFAULT,
    version: '1.0',
    lightdashSecret: 'secret',
    secureCookies: true,
    cookiesMaxAgeHours: undefined,
    trustProxy: true,
    rudder: {
        writeKey: '',
        dataPlaneUrl: '',
    },
    sentry: {
        dsn: '',
        release: '',
        environment: '',
    },
    auth: {
        disablePasswordAuthentication: false,
        enableGroupSync: false,
        google: {
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            loginPath: '',
            callbackPath: '',
            googleDriveApiKey: undefined,
            enabled: false,
        },
        okta: {
            loginPath: '',
            callbackPath: '',
            oauth2ClientSecret: undefined,
            oauth2ClientId: undefined,
            oauth2Issuer: undefined,
            authorizationServerId: undefined,
            extraScopes: undefined,
            oktaDomain: undefined,
        },
        oneLogin: {
            loginPath: '',
            callbackPath: '',
            oauth2ClientSecret: undefined,
            oauth2ClientId: undefined,
            oauth2Issuer: undefined,
        },
        azuread: {
            loginPath: '',
            callbackPath: '',
            oauth2ClientSecret: undefined,
            oauth2ClientId: undefined,
            oauth2TenantId: '',
            openIdConnectMetadataEndpoint: undefined,
            privateKeyFile: undefined,
            privateKeyFilePath: undefined,
            x509PublicKeyCert: undefined,
            x509PublicKeyCertPath: undefined,
        },
    },
    posthog: {
        projectApiKey: '',
        apiHost: '',
    },
    intercom: {
        appId: '',
        apiBase: '',
    },
    smtp: undefined,
    siteUrl: '',
    staticIp: '',
    database: {
        connectionUri: undefined,
        maxConnections: undefined,
        minConnections: undefined,
    },
    allowMultiOrgs: false,
    maxPayloadSize: '5mb',
    query: {
        maxLimit: 5000,
        csvCellsLimit: 100000,
    },
    scheduler: {
        enabled: false,
        concurrency: 1,
        jobTimeout: 1,
    },
    logging: {
        level: 'info',
        format: 'pretty',
        outputs: ['console'],
        consoleFormat: undefined,
        consoleLevel: undefined,
        fileFormat: undefined,
        filePath: '',
        fileLevel: undefined,
    },
    chart: {
        versionHistory: { daysLimit: 3 },
    },
    customVisualizations: {
        enabled: false,
    },
    pivotTable: {
        maxColumnLimit: 60,
    },
    resultsCache: {
        enabled: false,
        cacheStateTimeSeconds: 86400,
        s3: {},
    },
    groups: {
        enabled: false,
    },
    extendedUsageAnalytics: {
        enabled: false,
    },
};

type VersionSummaryRow = {
    saved_query_uuid: string;
    saved_queries_version_uuid: string;
    created_at: Date;
    user_uuid: string | null;
    first_name: string | null;
    last_name: string | null;
};

export const chartSummary: VersionSummaryRow = {
    saved_query_uuid: 'chart_uuid',
    saved_queries_version_uuid: 'version_uuid',
    created_at: new Date(),
    user_uuid: null,
    first_name: null,
    last_name: null,
};
