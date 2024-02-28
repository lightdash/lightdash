import { enableFetchMocks } from 'jest-fetch-mock';
import { LightdashAnalytics } from './src/analytics/LightdashAnalytics';
import {lightdashConfigMock} from "./src/config/lightdashConfig.mock";

enableFetchMocks();

jest.mock('./src/config/lightdashConfig', () => ({
    lightdashConfig: lightdashConfigMock,
}));

jest.mock('./src/analytics/client.ts', () => ({
    analytics: new LightdashAnalytics({
        lightdashConfig: lightdashConfigMock,
        writeKey: 'notrack',
        dataPlaneUrl:
            'notrack',
        options: {
            enable: false,
        }
    }),
    identifyUser: jest.fn(),
}));
