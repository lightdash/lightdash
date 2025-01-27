import {
    CreateScimOrganizationAccessToken,
    ScimOrganizationAccessToken,
    ScimOrganizationAccessTokenWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import {
    DbScimOrganizationAccessToken,
    ScimOrganizationAccessTokenTableName,
} from '../database/entities/scim';

export class ScimOrganizationAccessTokenModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static _hash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    static mapDbObjectToScimOrganizationAccessToken(
        data: DbScimOrganizationAccessToken,
    ): ScimOrganizationAccessToken {
        return {
            uuid: data.scim_organization_access_token_uuid,
            organizationUuid: data.organization_uuid,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
            description: data.description,
            lastUsedAt: data.last_used_at,
            rotatedAt: data.rotated_at,
        };
    }

    static generateToken(): { token: string; tokenHash: string } {
        const token = `scim_${crypto.randomBytes(16).toString('hex')}`;
        const tokenHash = ScimOrganizationAccessTokenModel._hash(token);
        return { token, tokenHash };
    }

    async create({
        user,
        data,
    }: {
        user: SessionUser;
        data: CreateScimOrganizationAccessToken;
    }): Promise<ScimOrganizationAccessTokenWithToken> {
        const { token, tokenHash } =
            ScimOrganizationAccessTokenModel.generateToken();
        const [row] = await this.database('scim_organization_access_tokens')
            .insert({
                created_by_user_uuid: user.userUuid,
                organization_uuid: data.organizationUuid,
                expires_at: data.expiresAt,
                description: data.description,
                token_hash: tokenHash,
            })
            .returning('*');
        if (row === undefined) {
            throw new UnexpectedDatabaseError(
                'Could not create SCIM access token',
            );
        }
        return {
            ...ScimOrganizationAccessTokenModel.mapDbObjectToScimOrganizationAccessToken(
                row,
            ),
            token,
        };
    }

    async delete(scimOrganizationAccessTokenUuid: string): Promise<void> {
        await this.database('scim_organization_access_tokens')
            .delete()
            .where(
                'scim_organization_access_token_uuid',
                scimOrganizationAccessTokenUuid,
            );
    }

    async updateUsedDate(
        scimOrganizationAccessTokenUuid: string,
    ): Promise<void> {
        await this.database(ScimOrganizationAccessTokenTableName)
            .update({
                last_used_at: new Date(),
            })
            .where(
                'scim_organization_access_token_uuid',
                scimOrganizationAccessTokenUuid,
            );
    }

    async rotate({
        scimOrganizationAccessTokenUuid,
        rotatedByUserUuid,
        expiresAt,
    }: {
        scimOrganizationAccessTokenUuid: string;
        rotatedByUserUuid: string;
        expiresAt: Date;
    }): Promise<ScimOrganizationAccessTokenWithToken> {
        const { token, tokenHash } =
            ScimOrganizationAccessTokenModel.generateToken();
        const [row] = await this.database(ScimOrganizationAccessTokenTableName)
            .update({
                rotated_at: new Date(),
                rotated_by_user_uuid: rotatedByUserUuid,
                expires_at: expiresAt,
                token_hash: tokenHash,
            })
            .where(
                'scim_organization_access_token_uuid',
                scimOrganizationAccessTokenUuid,
            )
            .returning('*');
        return {
            ...ScimOrganizationAccessTokenModel.mapDbObjectToScimOrganizationAccessToken(
                row,
            ),
            token,
        };
    }

    async getAllForOrganization(
        organizationUuid: string,
    ): Promise<ScimOrganizationAccessToken[]> {
        const rows = await this.database('scim_organization_access_tokens')
            .select('*')
            .where('organization_uuid', organizationUuid);
        return rows.map(
            ScimOrganizationAccessTokenModel.mapDbObjectToScimOrganizationAccessToken,
        );
    }

    async getTokenbyUuid(
        scimOrganizationAccessTokenUuid: string,
    ): Promise<ScimOrganizationAccessToken | undefined> {
        const [row] = await this.database('scim_organization_access_tokens')
            .select('*')
            .where(
                'scim_organization_access_token_uuid',
                scimOrganizationAccessTokenUuid,
            );
        return (
            row &&
            ScimOrganizationAccessTokenModel.mapDbObjectToScimOrganizationAccessToken(
                row,
            )
        );
    }

    async getByToken(token: string): Promise<ScimOrganizationAccessToken> {
        const hashedToken = ScimOrganizationAccessTokenModel._hash(token);
        const [row] = await this.database('scim_organization_access_tokens')
            .select('*')
            .where('token_hash', hashedToken);
        const mappedRow =
            ScimOrganizationAccessTokenModel.mapDbObjectToScimOrganizationAccessToken(
                row,
            );
        return mappedRow;
    }
}
