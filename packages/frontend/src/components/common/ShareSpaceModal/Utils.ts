import { type OrganizationMemberProfile } from '@lightdash/common';

export const getUserNameOrEmail = (
    userUuid: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
    email: string | undefined,
) => {
    if (firstName && lastName) {
        return `${firstName} ${lastName}`;
    } else if (email) {
        return email;
    } else {
        return userUuid;
    }
};

export const getInitials = (
    userUuid: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
    email: string | undefined,
) => {
    if (firstName && lastName) {
        return firstName.substr(0, 1) + lastName.substr(0, 1);
    } else if (email) {
        return email.substr(0, 2).toUpperCase();
    } else {
        return userUuid;
    }
};

export const getOrgUserInitials = (
    userUuid: string,
    organizationUsers: OrganizationMemberProfile[] | undefined,
) => {
    const user = organizationUsers?.find(
        (userAccess) => userAccess.userUuid === userUuid,
    );
    if (!user) return userUuid;

    if (user?.firstName) {
        return user.firstName.substr(0, 1) + user.lastName.substr(0, 1);
    } else {
        return user.email.substr(0, 2).toUpperCase();
    }
};

export const getOrgUserNameOrEmail = (
    userUuid: string,
    organizationUsers: OrganizationMemberProfile[] | undefined,
) => {
    const user = organizationUsers?.find(
        (userAccess) => userAccess.userUuid === userUuid,
    );
    if (!user) return userUuid;
    return user?.firstName ? `${user.firstName} ${user.lastName}` : user.email;
};
