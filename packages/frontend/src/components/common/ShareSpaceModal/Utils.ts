import { OrganizationMemberProfile } from '@lightdash/common';

export const getUserNameOrEmail = (
    userUuid: string,
    organizationUsers: OrganizationMemberProfile[] | undefined,
) => {
    const user = organizationUsers?.find(
        (userAccess) => userAccess.userUuid === userUuid,
    );
    if (!user) return userUuid;
    return user?.firstName ? `${user.firstName} ${user.lastName}` : user.email;
};

export const getInitials = (
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
