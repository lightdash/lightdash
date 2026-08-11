import { createHash, randomBytes } from 'crypto';
import { Knex } from 'knex';
import { HeadlessBrowserLoginGrantsTableName } from '../database/entities/headlessBrowserLoginGrants';

const LOGIN_GRANT_TTL_MS = 60_000;
const LOGIN_GRANT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type HeadlessBrowserLoginGrantModelArguments = {
    database: Knex;
};

const hashLoginGrant = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

export class HeadlessBrowserLoginGrantModel {
    private readonly database: Knex;

    constructor({ database }: HeadlessBrowserLoginGrantModelArguments) {
        this.database = database;
    }

    async createLoginGrant(userUuid: string): Promise<string> {
        const token = randomBytes(32).toString('base64url');
        await this.database.transaction(async (trx) => {
            await trx(HeadlessBrowserLoginGrantsTableName)
                .where('expires_at', '<=', trx.fn.now())
                .delete();
            await trx(HeadlessBrowserLoginGrantsTableName).insert({
                token_hash: hashLoginGrant(token),
                user_uuid: userUuid,
                expires_at: new Date(Date.now() + LOGIN_GRANT_TTL_MS),
            });
        });
        return token;
    }

    async consumeLoginGrant(token: string): Promise<string | null> {
        if (!LOGIN_GRANT_PATTERN.test(token)) {
            return null;
        }

        const [grant] = await this.database(HeadlessBrowserLoginGrantsTableName)
            .where('token_hash', hashLoginGrant(token))
            .where('expires_at', '>', this.database.fn.now())
            .delete()
            .returning('user_uuid');

        return grant?.user_uuid ?? null;
    }
}
