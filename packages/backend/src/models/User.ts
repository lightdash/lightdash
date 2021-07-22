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
import { AuthorizationError, ForbiddenError, NotExistsError } from '../errors';
import { updatePassword } from '../database/entities/passwordLogins';

const mapDbUserDetailsToLightdashUser = (
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
            return mapDbUserDetailsToLightdashUser(user);
        }
        throw new AuthorizationError('Email and password not recognized.');
    },
    register: async (...data: ArgumentsOf<typeof createInitialUser>) => {
        if (await hasUsers(database)) {
            throw new ForbiddenError('User already registered');
        }
        await createInitialUser(...data);
    },
    findById: async (uuid: string): Promise<SessionUser> => {
        const user = await getUserDetailsByUuid(database, uuid);
        return {
            userId: user.user_id,
            ...mapDbUserDetailsToLightdashUser(user),
        };
    },
    updateProfile: async (
        ...data: ArgumentsOf<typeof updateUser>
    ): Promise<LightdashUser> => {
        const user = await updateUser(...data);
        return mapDbUserDetailsToLightdashUser(user);
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
    },
};
