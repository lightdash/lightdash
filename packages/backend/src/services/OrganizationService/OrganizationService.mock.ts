import { Ability } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    SessionUser,
} from 'common';
import { DbOrganizationUser } from '../../models/UserModel';

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    isTrackingAnonymized: false,
    userId: 0,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([
        { subject: 'OrganizationMemberProfile', action: 'view' },
    ]),
};

export const orgUsers: DbOrganizationUser[] = [
    {
        user_uuid: 'a',
        email: 'email',
        last_name: 'last name',
        first_name: 'first name',
    },
    {
        user_uuid: 'b',
        email: 'email',
        last_name: 'last name',
        first_name: 'first name',
    },
];

export const ORGANIZATION_MEMBERS: OrganizationMemberProfile[] = [
    {
        organizationUuid: 'org',
        userUuid: 'aaa',
        firstName: 'Bubbles',
        lastName: 'PowerPuff',
        email: 'bubbles@powerpuff.com',
        role: OrganizationMemberRole.VIEWER,
    },
    {
        organizationUuid: 'org',
        userUuid: 'bbb',
        firstName: 'Buttercup',
        lastName: 'PowerPuff',
        email: 'buttercups@powerpuff.com',
        role: OrganizationMemberRole.VIEWER,
    },
];
