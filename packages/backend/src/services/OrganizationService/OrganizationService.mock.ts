import { Ability } from '@casl/ability';
import { OrganizationMemberRole, SessionUser } from 'common';
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
    ability: new Ability(),
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
