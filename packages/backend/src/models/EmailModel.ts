import { EmailStatus, NotFoundError } from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import { DbEmailOneTimePasscode } from '../database/entities/emailOneTimePasscodes';
import { DbEmail, DbEmailIn, DbEmailRemove } from '../database/entities/emails';

type DbEmailStatus = Pick<DbEmail, 'email' | 'is_verified'> &
    Partial<DbEmailOneTimePasscode>;

const convertEmailStatusRow = (row: DbEmailStatus): EmailStatus => {
    const emailStatus: EmailStatus = {
        email: row.email,
        isVerified: row.is_verified,
        otp: undefined,
    };
    if (row.created_at && row.number_of_attempts !== undefined) {
        emailStatus.otp = {
            createdAt: row.created_at,
            numberOfAttempts: row.number_of_attempts,
        };
    }
    return emailStatus;
};
export class EmailModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async createEmail(emailIn: DbEmailIn) {
        await this.database('emails').insert({
            ...emailIn,
            email: emailIn.email.toLowerCase(),
        });
    }

    async deleteEmail(emailRemove: DbEmailRemove) {
        await this.database('emails').where(emailRemove).delete();
    }

    async getEmailByAddress(
        emailAddress: string,
    ): Promise<{ email: string; userId: number }> {
        const [email] = await this.database('emails')
            .where('email', emailAddress)
            .select('*');
        if (email === undefined) {
            throw new NotFoundError(`Cannot find email ${emailAddress}`);
        }
        return {
            email: email.email,
            userId: email.user_id,
        };
    }

    async getPrimaryEmailStatus(userUuid: string): Promise<EmailStatus> {
        const [row] = await this.database('emails')
            .innerJoin('users', 'users.user_id', 'emails.user_id')
            .leftJoin(
                'email_one_time_passcodes',
                'email_one_time_passcodes.email_id',
                'emails.email_id',
            )
            .where('users.user_uuid', userUuid)
            .andWhere('is_primary', true)
            .select<DbEmailStatus[]>([
                'emails.email',
                'emails.is_verified',
                'email_one_time_passcodes.created_at',
                'email_one_time_passcodes.number_of_attempts',
            ]);
        if (row === undefined) {
            throw new NotFoundError(
                `Cannot find matching verification status for user's email`,
            );
        }
        return convertEmailStatusRow(row);
    }

    async createPrimaryEmailOtp({
        passcode,
        userUuid,
    }: {
        passcode: string;
        userUuid: string;
    }): Promise<EmailStatus> {
        const hashedPasscode = await bcrypt.hash(
            passcode,
            await bcrypt.genSalt(),
        );
        await this.database.raw<{ rows: DbEmailStatus[] }>(
            `
            WITH inserted AS (
                INSERT
                INTO email_one_time_passcodes (email_id, passcode)
                SELECT emails.email_id, ?
                FROM emails
                         INNER JOIN users ON users.user_id = emails.user_id
                WHERE is_primary = true
                  AND users.user_uuid = ? ON CONFLICT (email_id) 
                DO
                UPDATE
                    SET passcode = EXCLUDED.passcode,
                    created_at = DEFAULT,
                    number_of_attempts = DEFAULT
                RETURNING email_id
            )
            SELECT emails.email, emails.is_verified, email_one_time_passcodes.created_at, email_one_time_passcodes.number_of_attempts
            FROM emails
            LEFT JOIN email_one_time_passcodes 
                ON email_one_time_passcodes.email_id = emails.email_id
            INNER JOIN inserted 
                ON inserted.email_id = emails.email_id
        `,
            [hashedPasscode, userUuid],
        );
        return this.getPrimaryEmailStatus(userUuid);
    }

    async getPrimaryEmailStatusByUserAndOtp({
        userUuid,
        passcode,
    }: {
        userUuid: string;
        passcode: string;
    }): Promise<EmailStatus> {
        const [row] = await this.database('email_one_time_passcodes')
            .innerJoin(
                'emails',
                'emails.email_id',
                'email_one_time_passcodes.email_id',
            )
            .innerJoin('users', 'users.user_id', 'emails.user_id')
            .where('users.user_uuid', userUuid)
            .andWhere('is_primary', true)
            .select<DbEmailStatus[]>([
                'emails.email',
                'emails.is_verified',
                'email_one_time_passcodes.passcode',
                'email_one_time_passcodes.created_at',
                'email_one_time_passcodes.number_of_attempts',
            ]);
        const match =
            row !== undefined &&
            (await bcrypt.compare(passcode, row.passcode || ''));
        if (!match) {
            throw new NotFoundError(
                `Cannot find matching verification status for user's email`,
            );
        }
        return convertEmailStatusRow(row);
    }

    /**
     * No-op if email/user/otp does not exist
     * @param userUuid
     * @param email
     */
    async incrementPrimaryEmailOtpAttempts(userUuid: string): Promise<void> {
        await this.database.raw(
            `
            UPDATE email_one_time_passcodes
            SET number_of_attempts = number_of_attempts + 1
            FROM emails
            INNER JOIN users ON users.user_id = emails.user_id
            WHERE emails.is_primary = true
            AND users.user_uuid = ?
            AND email_one_time_passcodes.email_id = emails.email_id
        `,
            [userUuid],
        );
    }

    /**
     * No-op if email/user does not exist
     * @param userUuid
     * @param email
     */
    async verifyUserEmailIfExists(
        userUuid: string,
        email: string,
    ): Promise<{ email: string }[]> {
        const updatedRows = await this.database.raw<{
            rows: { email: string }[];
        }>(
            `
                UPDATE emails
                SET is_verified = true
                FROM users
                WHERE emails.user_id = users.user_id
                  AND users.user_uuid = ?
                  AND emails.email = ?
                RETURNING emails.email`,
            [userUuid, email],
        );
        return updatedRows.rows;
    }

    async deleteEmailOtp(userUuid: string, email: string): Promise<void> {
        await this.database('email_one_time_passcodes')
            .innerJoin(
                'emails',
                'emails.email_id',
                'email_one_time_passcodes.email_id',
            )
            .innerJoin('users', 'users.user_id', 'emails.user_id')
            .where('users.user_uuid', userUuid)
            .andWhere('emails.email', email)
            .delete();
    }
}
