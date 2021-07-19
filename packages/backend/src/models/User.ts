import { LightdashUser, ArgumentsOf } from 'common';
import bcrypt from 'bcrypt';
import {
    createInitialUser,
    getUserDetailsByPrimaryEmail,
    getUserDetailsByUuid,
    hasUsers,
} from '../database/entities/users';
import database from '../database/database';
import { AuthorizationError, ForbiddenError } from '../errors';

export const UserModel = {
    login: async (email: string, password: string): Promise<LightdashUser> => {
        const user = await getUserDetailsByPrimaryEmail(database, email);
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (match) {
            return {
                userUuid: user.user_uuid,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                organizationUuid: user.organization_uuid,
                organizationName: user.organization_name,
                isTrackingAnonymized: user.is_tracking_anonymized,
            };
        }
        throw new AuthorizationError('Email and password not recognized.');
    },
    register: async (...data: ArgumentsOf<typeof createInitialUser>) => {
        if (await hasUsers(database)) {
            throw new ForbiddenError('User already registered');
        }
        await createInitialUser(...data);
    },
    findById: async (uuid: string): Promise<LightdashUser> => {
        const user = await getUserDetailsByUuid(database, uuid);
        return {
            userUuid: user.user_uuid,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            organizationUuid: user.organization_uuid,
            organizationName: user.organization_name,
            isTrackingAnonymized: user.is_tracking_anonymized,
        };
    },
};
