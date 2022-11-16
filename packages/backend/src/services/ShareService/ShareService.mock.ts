import { Ability } from '@casl/ability';
import {
    LightdashMode,
    OrganizationMemberRole,
    SessionUser,
    ShareUrl,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const Config = {
    mode: LightdashMode.DEFAULT,
    siteUrl: 'https://test.lightdash.cloud',
} as LightdashConfig;

export const User: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([{ subject: 'Organization', action: ['view'] }]),
    isActive: true,
    abilityRules: [],
};

export const SampleShareUrl: ShareUrl = {
    nanoid: 'abc123',
    params: '?foo=bar',
    path: '/projects/uuid/tables/customers',
    createdByUserUuid: 'userUuid',
    organizationUuid: 'organizationUuid',
};

export const FullShareUrl = {
    ...SampleShareUrl,
    host: Config.siteUrl,
    shareUrl: `${Config.siteUrl}/share/${SampleShareUrl.nanoid}`,
    url: `${SampleShareUrl.path}${SampleShareUrl.params}`,
};

export const ShareUrlWithoutParams = {
    nanoid: 'abc123',
    params: '',
    path: '/projects/uuid/tables/customers',
};

export const FullShareUrlWithoutParams = {
    ...ShareUrlWithoutParams,
    host: Config.siteUrl,
    shareUrl: `${Config.siteUrl}/share/${SampleShareUrl.nanoid}`,
    url: `${SampleShareUrl.path}`,
};
