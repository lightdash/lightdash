import { EmailStatus, NotFoundError } from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import { DbEmailIn, DbEmailRemove } from '../database/entities/emails';

const getPrimaryEmailStatus = async (
    userUuid: string,
    trx: Knex,
): Promise<EmailStatus> => {
    const rows = await trx('emails')
        .innerJoin('users', 'users.user_id', 'emails.user_id')
        .leftJoin(
            'email_one_time_passcodes',
            'email_one_time_passcodes.email_id',
            'emails.email_id',
        )
        .where('email.is_primary', true)
        .andWhere('users.user_uuid', userUuid)
        .select<
            {
                email: string;
                is_verified: boolean;
                created_at?: Date;
                number_of_attempts?: number;
            }[]
        >([
            'emails.email',
            'emails.is_verified',
            'email_one_time_passcodes.created_at',
            'email_one_time_passcodes.number_of_attempts',
        ]);
    if (rows.length === 0) {
        throw new NotFoundError('Cannot find primary email for user');
    }
    const row = rows[0];
    const emailStatus: EmailStatus = {
        email: row.email,
        isVerified: row.is_verified,
        otp: undefined,
    };
    console.log(row);
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
        return getPrimaryEmailStatus(userUuid, this.database);
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
        return this.database.transaction(async (trx) => {
            trx.raw(
                `
            INSERT INTO email_one_time_passcodes (email_id, passcode)
            SELECT email_id, ?
            FROM emails
            INNER JOIN users ON users.user_id = emails.user_id
            WHERE is_primary = true
            AND users.user_uuid = ?
            ON CONFLICT (email_id) 
            DO UPDATE 
                SET passcode = EXCLUDED.passcode, 
                created_at = DEFAULT, 
                number_of_attempts = DEFAULT;
        `,
                [hashedPasscode, userUuid],
            );
            return getPrimaryEmailStatus(userUuid, trx);
        });
    }

    async verifyPrimaryEmailOtp({
        userUuid,
        passcode,
    }: {
        userUuid: string;
        passcode: string;
    }): Promise<EmailStatus> {
        const emailStatus = await this.database.transaction(async (trx) => {
            const [row] = await trx('email_one_time_passcodes')
                .innerJoin(
                    'emails',
                    'emails.email_id',
                    'email_one_time_passcodes.email_id',
                )
                .innerJoin('users', 'users.user_id', 'emails.user_id')
                .where('users.user_uuid', userUuid)
                .andWhere('is_primary', true)
                .select('passcode');
            const match = await bcrypt.compare(passcode, row?.passcode || '');
            if (row?.email_id && match) {
                trx('emails')
                    .update({ is_verified: true })
                    .where('email_id', row.email_id);
            }
            return getPrimaryEmailStatus(userUuid, trx);
        });
        return emailStatus;
    }
}
