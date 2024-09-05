import { NotFoundError } from '@lightdash/common';
import knex from 'knex';
import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { UserModel } from './models/UserModel';

(async function init() {
    try {
        Logger.warn(`Override user password`);
        const email: string | undefined = process.argv[2];
        const newPassword: string | undefined = process.argv[3];

        if (!email) {
            throw new Error('Email is undefined');
        }

        if (!newPassword) {
            throw new Error('New password is undefined');
        }
        const environment =
            process.env.NODE_ENV === 'development'
                ? 'development'
                : 'production';
        const userModel = new UserModel({
            lightdashConfig,
            database: knex(
                environment === 'production'
                    ? knexConfig.production
                    : knexConfig.development,
            ),
        });

        Logger.info(`Get user by email: ${email}`);
        const user = await userModel.findUserByEmail(email);
        if (user === undefined) {
            throw new NotFoundError(`Cannot find user with email: ${email}`);
        }
        Logger.info(`Updating user (${user.userUuid}) password...`);
        await userModel.updatePassword(user.userUuid, newPassword);
        Logger.info(`Successfully updated user (${user.userUuid}) password!`);
        process.exit();
    } catch (error) {
        Logger.error(`Error overriding user password: ${error.message}`);
        process.exit(1);
    }
})();
