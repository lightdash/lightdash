import { LightdashMode } from 'common';
import { LightdashConfig } from '../../config/parseConfig';

export const BaseResponse = {
    healthy: true,
    version: '0.1.0',
    mode: LightdashMode.DEFAULT,
    isAuthenticated: false,
    localDbtEnabled: true,
    needsSetup: false,
    needsProject: false,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            loginPath: '',
            oauth2ClientId: '',
        },
    },
    defaultProject: undefined,
    latest: { version: Image.name },
    hasEmailClient: false,
    siteUrl: undefined,
    intercom: undefined,
    cohere: undefined,
    rudder: undefined,
    sentry: undefined,
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
    },
} as LightdashConfig;
