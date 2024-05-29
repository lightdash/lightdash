import { Ability } from '@casl/ability';
import {
    CreateInviteLink,
    InviteLink,
    LightdashUser,
    OpenIdIdentity,
    OpenIdIdentityIssuerType,
    Organization,
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
    email: openIdUser.openId.email,
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
    ability: new Ability([{ subject: 'InviteLink', action: ['create'] }]),
    isActive: true,
    abilityRules: [],
};

export const authenticatedUser: SessionUser = {
    ...sessionUser,
    userId: 10000,
};

export const openIdIdentity: OpenIdIdentity = {
    issuer: 'google',
    issuerType: OpenIdIdentityIssuerType.GOOGLE,
    subject: 'subject123',
    email: 'email',
    userUuid: 'userUuid',
    createdAt: new Date(),
};

export const inviteLink: InviteLink = {
    email: openIdUser.openId.email,
    expiresAt: new Date(),
    inviteCode: 'inviteCode',
    inviteUrl: 'inviteUrl',
    organizationUuid: 'organizationUuid',
    userUuid: 'userUuid',
};

export const inviteUser: CreateInviteLink = {
    expiresAt: new Date(),
    email: openIdUser.openId.email,
    role: OrganizationMemberRole.ADMIN,
};

export const newUser: SessionUser = {
    userUuid: 'newUserUuid',
    email: inviteUser.email,
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: false,
    userId: 0,
    role: inviteUser.role,
    ability: new Ability([]),
    isActive: false,
    abilityRules: [],
};

export const organisation: Organization = {
    organizationUuid: 'organizationUuid',
    name: 'organizationName',
};

export const userWithoutOrg: LightdashUser = {
    userUuid: 'newUserUuid',
    email: inviteUser.email,
    firstName: 'firstName',
    lastName: 'lastName',
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: false,
    isActive: false,
};
