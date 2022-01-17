import { LightdashMode } from 'common';
import { enableFetchMocks } from 'jest-fetch-mock';
import { LightdashAnalytics } from './src/analytics/LightdashAnalytics';

enableFetchMocks();

jest.mock('./src/config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
        database: {},
    },
}));

jest.mock('./src/analytics/client.ts', () => ({
    analytics: new LightdashAnalytics('notrack', 'notrack', {
        enable: false,
    }),
    identifyUser: jest.fn(),
}));
