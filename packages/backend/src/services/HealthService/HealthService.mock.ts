import { LightdashMode } from '@lightdash/common';
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
    },
    defaultProject: undefined,
    latest: { version: '0.2.7' },
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
        okta: {
            loginPath: '',
        },
    },
} as LightdashConfig;
