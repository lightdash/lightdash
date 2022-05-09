import { NotFoundError } from 'common';
import { Knex } from 'knex';
import { DbEmailIn, DbEmailRemove } from '../database/entities/emails';

export class EmailModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async createEmail(emailIn: DbEmailIn) {
        await this.database('emails').insert(emailIn);
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
}
