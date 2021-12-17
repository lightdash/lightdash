import database from './database/database';
import { updatePassword } from './database/entities/passwordLogins';
import { getUserDetailsByPrimaryEmail } from './database/entities/users';
import Logger from './logger';

(async function init() {
    Logger.warn(`Override user password`);
    const email: string | undefined = process.argv[2];
    const newPassword: string | undefined = process.argv[3];

    if (!email) {
        throw new Error('Email is undefined');
    }

    if (!newPassword) {
        throw new Error('New password is undefined');
    }

    Logger.info(`Get user by email: ${email}`);
    const user = await getUserDetailsByPrimaryEmail(database, email);
    Logger.info(`Update user (${user.user_id}) password`);
    await updatePassword(user.user_id, newPassword);
    Logger.info(`Successfully updated user (${user.user_id}) password`);
    process.exit();
})();
