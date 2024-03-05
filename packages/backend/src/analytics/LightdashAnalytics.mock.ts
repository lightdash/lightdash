import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { LightdashAnalytics } from './LightdashAnalytics';

export const analyticsMock = new LightdashAnalytics({
    lightdashConfig: lightdashConfigMock,
    writeKey: 'notrack',
    dataPlaneUrl: 'notrack',
    options: {
        enable: false,
    },
});
