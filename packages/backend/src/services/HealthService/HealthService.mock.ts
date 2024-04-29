import { LightdashMode, SessionUser } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const BaseResponse = {
    healthy: true,
    version: '0.1.0',
    mode: LightdashMode.DEFAULT,
    isAuthenticated: false,
    requiresOrgRegistration: false,
    localDbtEnabled: true,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            loginPath: '',
            oauth2ClientId: '',
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
    defaultProject: undefined,
    latest: { version: '0.2.7' },
    hasEmailClient: false,
    siteUrl: undefined,
    intercom: undefined,
    posthog: undefined,
    rudder: undefined,
    sentry: {
        frontend: {
            dsn: 'frontend-dsn.sentry.io',
        },
        environment: 'environment',
        release: '1234',
    },
    hasSlack: false,
    hasHeadlessBrowser: false,
    query: undefined,
    staticIp: undefined,
    hasDbtSemanticLayer: false,
    hasGroups: false,
    hasExtendedUsageAnalytics: false,
    hasGithub: false,
};

export const Config = {
    mode: LightdashMode.DEFAULT,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            loginPath: '',
            oauth2ClientId: '',
            oauth2ClientSecret: '',
            callbackPath: '',
        },
        okta: {
            loginPath: '',
        },
        oneLogin: {
            loginPath: '',
        },
        azuread: {
            loginPath: '',
        },
        oidc: {
            loginPath: '',
        },
    },
    groups: {
        enabled: false,
    },
    extendedUsageAnalytics: {
        enabled: false,
    },
    sentry: {
        backend: {
            dsn: 'backend-dsn.sentry.io',
        },
        frontend: {
            dsn: 'frontend-dsn.sentry.io',
        },
        environment: 'environment',
        release: '1234',
    },
} as LightdashConfig; // TODO: Refactor this to be a mock of the actual configuration, rather than a partial that might contain incorrect properties.

export const userMock = {
    userUuid: 'uuid',
    organizationUuid: 'orguuid',
} as any as SessionUser;
