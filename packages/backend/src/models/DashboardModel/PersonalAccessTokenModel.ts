import {
    CreatePersonalAccessToken,
    NotFoundError,
    PersonalAccessToken,
    PersonalAccessTokenWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import {
    DbPersonalAccessToken,
    PersonalAccessTokenTableName,
} from '../../database/entities/personalAccessTokens';

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
            rotatedAt: data.rotated_at,
            lastUsedAt: data.last_used_at,
            expiresAt: data.expires_at,
            description: data.description,
        };
    }

    async getAllForUser(userId: number): Promise<PersonalAccessToken[]> {
        const rows = await this.database(PersonalAccessTokenTableName)
            .select('*')
            .where('created_by_user_id', userId);
        return rows.map(
            PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken,
        );
    }

    async getUserToken({
        userUuid,
        tokenUuid,
    }: {
        userUuid: string;
        tokenUuid: string;
    }): Promise<PersonalAccessToken> {
        const row = await this.database(PersonalAccessTokenTableName)
            .leftJoin(
                'users',
                'personal_access_tokens.created_by_user_id',
                'users.user_id',
            )
            .select('personal_access_tokens.*')
            .where('users.user_uuid', userUuid)
            .andWhere(
                'personal_access_tokens.personal_access_token_uuid',
                tokenUuid,
            )
            .first();
        if (row === undefined) {
            throw new NotFoundError('Personal access token not found');
        }
        return PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row);
    }

    async updateUsedDate(personalAccessTokenUuid: string): Promise<void> {
        await this.database(PersonalAccessTokenTableName)
            .update({
                last_used_at: new Date(),
            })
            .where('personal_access_token_uuid', personalAccessTokenUuid);
    }

    async rotate({
        personalAccessTokenUuid,
        expiresAt,
    }: {
        personalAccessTokenUuid: string;
        expiresAt: Date;
    }): Promise<PersonalAccessTokenWithToken> {
        const token = crypto.randomBytes(16).toString('hex');
        const tokenHash = PersonalAccessTokenModel._hash(token);
        const [row] = await this.database(PersonalAccessTokenTableName)
            .update({
                rotated_at: new Date(),
                expires_at: expiresAt,
                token_hash: tokenHash,
            })
            .where('personal_access_token_uuid', personalAccessTokenUuid)
            .returning('*');
        return {
            ...PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row),
            token,
        };
    }

    async create(
        user: Pick<SessionUser, 'userId'>,
        data: CreatePersonalAccessToken,
    ): Promise<PersonalAccessTokenWithToken> {
        const token = crypto.randomBytes(16).toString('hex');
        const tokenHash = PersonalAccessTokenModel._hash(token);
        const [row] = await this.database(PersonalAccessTokenTableName)
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
            ...PersonalAccessTokenModel.mapDbObjectToPersonalAccessToken(row),
            token,
        };
    }

    async delete(personalAccessTokenUuid: string): Promise<void> {
        await this.database(PersonalAccessTokenTableName)
            .delete()
            .where('personal_access_token_uuid', personalAccessTokenUuid);
    }
}
