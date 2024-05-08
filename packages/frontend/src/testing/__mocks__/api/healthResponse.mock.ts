import { LightdashMode, type HealthState } from '@lightdash/common';

export default function mockHealthResponse(
    overrides: Partial<HealthState> = {},
): HealthState {
    return {
        healthy: true,
        mode: LightdashMode.CLOUD_BETA,
        version: '0.0.0',
        localDbtEnabled: true,
        isAuthenticated: true,
        requiresOrgRegistration: false,
        latest: {
            version: '0.0.0',
        },
        rudder: {
            dataPlaneUrl: '',
            writeKey: '',
        },
        sentry: {
            frontend: {
                dsn: '',
            },
            release: '',
            environment: '',
        },
        intercom: {
            appId: '',
            apiBase: '',
        },
        pylon: {
            appId: '',
        },
        siteUrl: 'http://localhost:3000',
        staticIp: '',
        posthog: {
            projectApiKey: '',
            apiHost: '',
        },
        query: {
            maxLimit: 1000000,
            csvCellsLimit: 100,
        },
        pivotTable: {
            maxColumnLimit: 100,
        },
        customVisualizationsEnabled: true,
        hasSlack: false,
        auth: {
            disablePasswordAuthentication: false,
            google: {
                googleDriveApiKey: '',
                oauth2ClientId: '',
                loginPath: '/login/google',
                enabled: false,
            },
            okta: {
                loginPath: '/login/okta',
                enabled: false,
            },
            oneLogin: {
                loginPath: '/login/oneLogin',
                enabled: false,
            },
            azuread: {
                loginPath: '/login/azuread',
                enabled: false,
            },
            oidc: {
                loginPath: '/login/oidc',
                enabled: false,
            },
        },
        hasEmailClient: false,
        hasHeadlessBrowser: false,
        hasDbtSemanticLayer: false,
        hasGroups: false,
        hasExtendedUsageAnalytics: false,
        hasGithub: false,
        ...overrides,
    };
}
