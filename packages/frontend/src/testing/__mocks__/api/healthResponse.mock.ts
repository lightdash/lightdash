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
        siteName: 'Lightdash',
        siteLogo: '{{host}}/lightdash-logo.png',
        siteLogoAlt: 'Lightdash logo',
        siteLogoDark: '{{host}}/lightdash-logo.png',
        siteLogoBlack: '{{host}}/lightdash-logo.png',
        siteLogoWhite: '{{host}}/lightdash-logo.png',
        siteTouchIconGrey: '{{host}}/lightdash-logo.png',
        siteTitleText:
            "Explore and visualize your team's analytics and metrics",
        siteFavicon: '/favicon.ico',
        siteTouchIcon: '/apple-touch-icon.png',
        siteGithubIcon: '{{host}}/github.png',
        siteGithubUrl: 'https://github.com/lightdash/lightdash',
        siteLinkedinIcon: '{{host}}/linkedin.png',
        siteLinkedinUrl: 'https://www.linkedin.com/company/lightdash',
        siteTwitterIcon: '{{host}}/twitter.png',
        siteTwitterUrl: 'https://twitter.com/lightdash_devs',
        siteTOSUrl: 'https://lightdash.com/terms-of-service',
        siteHelpdeskUrl: 'https://docs.lightdash.com',
        supportEmail: 'support@lightdash.com',
        sitePrivacyPolicyUrl: 'https://lightdash.com/privacy-policy',
        siteSlackCommunityUrl:
            'https://lightdash-community.slack.com/ssb/redirect',
        ...overrides,
    };
}
