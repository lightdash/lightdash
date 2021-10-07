import { LightdashUser, ArgumentsOf, SessionUser } from 'common';
import bcrypt from 'bcrypt';
import {
    createInitialUser,
    DbUserDetails,
    getUserDetailsByPrimaryEmail,
    getUserDetailsByUuid,
    hasUsers,
    updateUser,
} from '../database/entities/users';
import database from '../database/database';
import { AuthorizationError, ForbiddenError } from '../errors';
import { updatePassword } from '../database/entities/passwordLogins';
import { analytics, identifyUser } from '../analytics/client';

export const mapDbUserDetailsToLightdashUser = (
    user: DbUserDetails,
): LightdashUser => ({
    userUuid: user.user_uuid,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    organizationUuid: user.organization_uuid,
    organizationName: user.organization_name,
    isTrackingAnonymized: user.is_tracking_anonymized,
});

export const UserModel = {
    login: async (email: string, password: string): Promise<LightdashUser> => {
        const user = await getUserDetailsByPrimaryEmail(database, email);
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (match) {
            const lightdashUser = mapDbUserDetailsToLightdashUser(user);
            identifyUser(lightdashUser);
            analytics.track({
                organizationId: lightdashUser.organizationUuid,
                userId: lightdashUser.userUuid,
                event: 'user.logged_in',
            });
            return lightdashUser;
        }
        throw new AuthorizationError('Email and password not recognized.');
    },
    register: async (...data: ArgumentsOf<typeof createInitialUser>) => {
        if (await hasUsers(database)) {
            throw new ForbiddenError('User already registered');
        }
        const user = await createInitialUser(...data);
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        identifyUser(lightdashUser);
        analytics.track({
            event: 'user.created',
            organizationId: lightdashUser.organizationUuid,
            userId: lightdashUser.userUuid,
        });
        analytics.track({
            event: 'organization.created',
            userId: lightdashUser.userUuid,
            organizationId: lightdashUser.organizationUuid,
            properties: {
                organizationUuid: lightdashUser.organizationUuid,
                organizationName: lightdashUser.organizationName,
            },
        });
        return lightdashUser;
    },
    findSessionUserByUUID: async (uuid: string): Promise<SessionUser> => {
        const user = await getUserDetailsByUuid(database, uuid);
        return {
            userId: user.user_id,
            ...mapDbUserDetailsToLightdashUser(user),
        };
    },
    lightdashUserFromSession: (sessionUser: SessionUser): LightdashUser => {
        const { userId, ...lightdashUser } = sessionUser;
        return lightdashUser;
    },
    updateProfile: async (
        ...data: ArgumentsOf<typeof updateUser>
    ): Promise<LightdashUser> => {
        const user = await updateUser(...data);
        const lightdashUser = await mapDbUserDetailsToLightdashUser(user);
        identifyUser(lightdashUser);
        analytics.track({
            userId: lightdashUser.userUuid,
            organizationId: lightdashUser.organizationUuid,
            event: 'user.updated',
        });
        return lightdashUser;
    },
    updatePassword: async (
        userId: number,
        userUuid: string,
        data: {
            password: string;
            newPassword: string;
        },
    ): Promise<void> => {
        const user = await getUserDetailsByUuid(database, userUuid);
        const match = await bcrypt.compare(
            data.password,
            user.password_hash || '',
        );
        if (!match) {
            throw new AuthorizationError('Password not recognized.');
        }
        await updatePassword(userId, data.newPassword);
        analytics.track({
            userId: user.user_uuid,
            organizationId: user.organization_uuid,
            event: 'password.updated',
        });
    },
};
