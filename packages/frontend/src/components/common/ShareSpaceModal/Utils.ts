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
