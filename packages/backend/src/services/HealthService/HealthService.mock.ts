import { Ability } from '@casl/ability';
import { LightdashMode, OrganizationMemberRole, SessionUser } from 'common';
import { LightdashConfig } from '../../config/parseConfig';

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([{ subject: 'Project', action: 'update' }]),
};

export const BaseResponse = {
    healthy: true,
    version: '0.1.0',
    mode: LightdashMode.DEFAULT,
    isAuthenticated: false,
    localDbtEnabled: true,
    needsProject: false,
    auth: {
        disablePasswordAuthentication: false,
        google: {
            loginPath: '',
            oauth2ClientId: '',
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
    },
} as LightdashConfig;
