import { LightdashMode } from 'common';
import { enableFetchMocks } from 'jest-fetch-mock';
import { LightdashAnalytics } from './src/analytics/LightdashAnalytics';

enableFetchMocks();

jest.mock('./src/config/lightdashConfig', () => ({
    lightdashConfig: {
        chatwoot: { websiteToken: '', baseUrl: '' },
        cohere: { token: '' },
        host: '',
        lightdashSecret: '',
        projects: [],
        protocol: '',
        rudder: { writeKey: '', dataPlaneUrl: '' },
        secureCookies: false,
        sentry: { dsn: '', release: '', environment: '' },
        smtp: {
            host: '',
            sender: { name: '', email: '' },
            auth: { user: undefined, accessToken: undefined, pass: undefined },
            secure: false,
            port: 568,
            allowInvalidCertificate: false,
        },
        trustProxy: false,
        version: '1.0',
        mode: LightdashMode.DEFAULT,
    },
}));

jest.mock('./src/analytics/client.ts', () => ({
    analytics: new LightdashAnalytics('notrack', 'notrack', {
        enable: false,
    }),
    identifyUser: jest.fn(),
}));
