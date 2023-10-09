import {
    CreatePersonalAccessToken,
    PersonalAccessToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { DbPersonalAccessToken } from '../../database/entities/personalAccessTokens';

export class PersonalAccessTokenModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static _hash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    static mapDbObjectToPersonalAccessToken(
        data: DbPersonalAccessToken,
    ): PersonalAccessToken {
        return {
            uuid: data.personal_access_token_uuid,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
            description: data.description,
        };
    }

    async getAllForUser(userId: number): Promise<PersonalAccessToken[]> {
        const rows = await this.database('personal_access_tokens')
            .select('*')
            .where('created_by_user_id', userId);
        return rows.map(
            PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken,
        );
    }

    async create(
        user: Pick<SessionUser, 'userId'>,
        data: CreatePersonalAccessToken,
    ): Promise<PersonalAccessToken & { token: string }> {
        const token = crypto.randomBytes(16).toString('hex');
        const tokenHash = PersonalAccessTokenModel._hash(token);
        const [row] = await this.database('personal_access_tokens')
            .insert({
                created_by_user_id: user.userId,
                expires_at: data.expiresAt,
                description: data.description,
                token_hash: tokenHash,
            })
            .returning('*');
        if (row === undefined) {
            throw new UnexpectedDatabaseError(
                'Could not create personal access token',
            );
        }
        return {
            ...data,
            createdAt: row.created_at,
            token,
        };
    }

    async delete(personalAccessTokenUuid: string): Promise<void> {
        await this.database('personal_access_tokens')
            .delete()
            .where('personal_access_token_uuid', personalAccessTokenUuid);
    }
}
