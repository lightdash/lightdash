import {
    AnyType,
    HealthState,
    LightdashMode,
    SessionUser,
} from '@lightdash/common';

export const BaseResponse: HealthState = {
    healthy: true,
    version: '0.1.0',
    mode: LightdashMode.DEFAULT,
    isAuthenticated: false,
    requiresOrgRegistration: false,
    localDbtEnabled: true,
    siteUrl: 'https://test.lightdash.cloud',
    staticIp: '',
    hasEmailClient: false,
    hasExtendedUsageAnalytics: false,
    hasMicrosoftTeams: false,
    hasGithub: false,
    hasHeadlessBrowser: false,
    hasSlack: false,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            enabled: false,
            loginPath: '',
            oauth2ClientId: undefined,
            googleDriveApiKey: undefined,
            enableGCloudADC: false,
        },
        okta: {
            enabled: false,
            loginPath: '',
        },
        oneLogin: {
            enabled: false,
            loginPath: '',
        },
        azuread: {
            enabled: false,
            loginPath: '',
        },
        oidc: {
            enabled: false,
            loginPath: '',
        },
        pat: {
            maxExpirationTimeInDays: undefined,
        },
        snowflake: {
            enabled: false,
        },
    },
    intercom: {
        apiBase: '',
        appId: '',
    },
    latest: {
        version: '0.2.7',
    },
    pivotTable: {
        maxColumnLimit: 0,
    },
    posthog: undefined,
    pylon: {
        appId: '',
    },
    query: {
        csvCellsLimit: 100000,
        maxLimit: 5000,
        maxPageSize: 2500,
        defaultLimit: 500,
    },
    rudder: {
        dataPlaneUrl: '',
        writeKey: '',
    },
    sentry: {
        environment: '',
        frontend: {
            dsn: '',
        },
        release: '',
        tracesSampleRate: 0,
        profilesSampleRate: 0,
    },
    hasCacheAutocompleResults: false,
    appearance: {
        overrideColorPalette: undefined,
        overrideColorPaletteName: undefined,
    },
    isServiceAccountEnabled: false,
};

export const userMock = {
    userUuid: 'uuid',
    organizationUuid: 'orguuid',
} as AnyType as SessionUser;
