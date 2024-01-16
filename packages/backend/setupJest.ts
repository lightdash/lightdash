import { LightdashMode } from '@lightdash/common';
import { enableFetchMocks } from 'jest-fetch-mock';
import { LightdashAnalytics } from './src/analytics/LightdashAnalytics';

enableFetchMocks();

jest.mock('./src/config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
        database: {},
        logging: {
            level: 'debug',
            outputs: 'console',
            format: 'pretty',
        },
        posthog: { projectApiKey: '' },
    },
}));

jest.mock('./src/analytics/client.ts', () => ({
    analytics: new LightdashAnalytics('notrack', 'notrack', {
        enable: false,
    }),
    identifyUser: jest.fn(),
}));
