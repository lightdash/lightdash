import { Ability } from '@casl/ability';
import {
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    SessionUser,
    type OpenIdUser,
} from '@lightdash/common';

export const openIdUser: OpenIdUser = {
    openId: {
        email: 'test@test.com',
        firstName: 'test',
        issuer: 'google',
        issuerType: OpenIdIdentityIssuerType.GOOGLE,
        lastName: 'test',
        subject: 'subject123',
    },
};
export const openIdUserWithInvalidIssuer: OpenIdUser = {
    openId: {
        ...openIdUser.openId,
        issuerType: 'invalid_issuer' as any,
    },
};

export const sessionUser: SessionUser = {
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
    ability: new Ability([]),
    isActive: true,
    abilityRules: [],
};
