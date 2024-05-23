import { HealthState, LightdashMode, SessionUser } from '@lightdash/common';

export const BaseResponse: HealthState = {
    healthy: true,
    version: '0.1.0',
    mode: LightdashMode.DEFAULT,
    isAuthenticated: false,
    requiresOrgRegistration: false,
    localDbtEnabled: true,
    siteUrl: 'https://test.lightdash.cloud',
    staticIp: '',
    customVisualizationsEnabled: false,
    hasDbtSemanticLayer: false,
    hasEmailClient: false,
    hasExtendedUsageAnalytics: false,
    hasGithub: false,
    hasGroups: false,
    hasHeadlessBrowser: false,
    hasSlack: false,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            enabled: false,
            loginPath: '',
            oauth2ClientId: undefined,
            googleDriveApiKey: undefined,
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
    posthog: {
        apiHost: '',
        projectApiKey: '',
    },
    pylon: {
        appId: '',
    },
    query: {
        csvCellsLimit: 100000,
        maxLimit: 5000,
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
    },
};

export const userMock = {
    userUuid: 'uuid',
    organizationUuid: 'orguuid',
} as any as SessionUser;
