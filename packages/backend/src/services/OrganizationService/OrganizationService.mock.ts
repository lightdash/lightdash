import { Ability } from '@casl/ability';
import {
    LightdashMode,
    Organisation,
    OrganizationMemberRole,
    SessionUser,
} from '@lightdash/common';
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
    ability: new Ability([
        { subject: 'Dashboard', action: ['update', 'delete', 'create'] },
    ]),
    isActive: true,
    projectRoles: [],
};

export const organisation: Organisation = {
    organizationUuid: 'organizationUuid',
    name: 'Lightdash',
    allowedEmailDomains: ['lightdash.com'],
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
