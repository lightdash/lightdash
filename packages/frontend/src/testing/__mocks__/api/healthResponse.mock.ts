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
            tracesSampleRate: 0,
            profilesSampleRate: 0,
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
        posthog: undefined,
        query: {
            maxPageSize: 2500,
            maxLimit: 1000000,
            defaultLimit: 500,
            csvCellsLimit: 100,
        },
        pivotTable: {
            maxColumnLimit: 100,
        },
        hasSlack: false,
        auth: {
            disablePasswordAuthentication: false,
            google: {
                googleDriveApiKey: '',
                oauth2ClientId: '',
                loginPath: '/login/google',
                enabled: false,
                enableGCloudADC: false,
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
            pat: {
                maxExpirationTimeInDays: undefined,
            },
            snowflake: {
                enabled: false,
            },
        },
        hasEmailClient: false,
        hasHeadlessBrowser: false,
        hasExtendedUsageAnalytics: false,
        hasGithub: false,
        hasCacheAutocompleResults: false,
        hasMicrosoftTeams: false,
        appearance: {
            overrideColorPalette: undefined,
            overrideColorPaletteName: undefined,
        },
        isServiceAccountEnabled: false,
        ...overrides,
    };
}
