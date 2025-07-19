/* eslint-disable class-methods-use-this */
import {
    OAuthAccessToken,
    OAuthAuthorizationCode,
    OAuthClient,
    OAuthRefreshToken,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

import {
    DbOAuthAccessToken,
    DbOAuthAccessTokenIn,
    OAuthAccessTokenTableName,
} from '../database/entities/oauthAccessTokens';
import {
    DbOAuthAuthorizationCode,
    DbOAuthAuthorizationCodeIn,
    OAuthAuthorizationCodeTableName,
} from '../database/entities/oauthAuthorizationCodes';

import {
    DbOAuthRefreshToken,
    DbOAuthRefreshTokenIn,
    OAuthRefreshTokenTableName,
} from '../database/entities/oauthRefreshTokens';

type OAuthModelArguments = {
    database: Knex;
};

export const DEFAULT_OAUTH_CLIENT_ID = 'lightdash-cli';

export class OAuthModel {
    private readonly database: Knex;

    constructor({ database }: OAuthModelArguments) {
        this.database = database;
    }

    // There is going to be a single client
    // for all instances and customers
    async getClient(): Promise<OAuthClient | null> {
        return {
            clientUuid: uuidv4(),
            id: DEFAULT_OAUTH_CLIENT_ID,
            clientId: DEFAULT_OAUTH_CLIENT_ID,
            clientName: 'Lightdash CLI',
            clientSecret: '',
            redirectUris: ['http://localhost:*'],
            grants: ['authorization_code', 'refresh_token'],
            scopes: ['read', 'write'],
        };
    }

    // Authorization code operations
    async saveAuthorizationCode(
        codeData: Omit<DbOAuthAuthorizationCodeIn, 'authorization_code_uuid'>,
    ): Promise<OAuthAuthorizationCode> {
        const [code] = await this.database(OAuthAuthorizationCodeTableName)
            .insert(codeData)
            .returning('*');

        return this.mapDbAuthorizationCodeToOAuthAuthorizationCode(code);
    }

    async getAuthorizationCode(
        authorizationCode: string,
    ): Promise<OAuthAuthorizationCode | null> {
        const code = await this.database(OAuthAuthorizationCodeTableName)
            .where({ authorization_code: authorizationCode })
            .whereNull('used_at')
            .where('expires_at', '>', new Date())
            .first();

        if (!code) {
            return null;
        }

        return this.mapDbAuthorizationCodeToOAuthAuthorizationCode(code);
    }

    async revokeAuthorizationCode(
        authorizationCodeUuid: string,
    ): Promise<void> {
        await this.database(OAuthAuthorizationCodeTableName)
            .where({ authorization_code_uuid: authorizationCodeUuid })
            .update({ used_at: new Date() });
    }

    // Access token operations
    async saveAccessToken(
        tokenData: Omit<DbOAuthAccessTokenIn, 'access_token_uuid'>,
    ): Promise<OAuthAccessToken> {
        const [token] = await this.database(OAuthAccessTokenTableName)
            .insert(tokenData)
            .returning('*');

        return this.mapDbAccessTokenToOAuthAccessToken(token);
    }

    async getAccessToken(
        accessToken: string,
    ): Promise<OAuthAccessToken | null> {
        const token = await this.database(OAuthAccessTokenTableName)
            .where({ access_token: accessToken })
            .whereNull('revoked_at')
            .where('expires_at', '>', new Date())
            .first();

        if (!token) {
            return null;
        }

        return this.mapDbAccessTokenToOAuthAccessToken(token);
    }

    async revokeAccessToken(accessTokenUuid: string): Promise<void> {
        await this.database(OAuthAccessTokenTableName)
            .where({ access_token_uuid: accessTokenUuid })
            .update({ revoked_at: new Date() });
    }

    async updateAccessTokenLastUsed(accessTokenUuid: string): Promise<void> {
        await this.database(OAuthAccessTokenTableName)
            .where({ access_token_uuid: accessTokenUuid })
            .update({ last_used_at: new Date() });
    }

    async getAccessTokenByUserAndClient(
        userUuid: string,
    ): Promise<OAuthAccessToken | null> {
        const token = await this.database(OAuthAccessTokenTableName)
            .where({
                user_uuid: userUuid,
            })
            .whereNull('revoked_at')
            .where('expires_at', '>', new Date())
            .orderBy('created_at', 'desc')
            .first();

        if (!token) {
            return null;
        }

        return this.mapDbAccessTokenToOAuthAccessToken(token);
    }

    // Refresh token operations
    async saveRefreshToken(
        tokenData: Omit<DbOAuthRefreshTokenIn, 'refresh_token_uuid'>,
    ): Promise<OAuthRefreshToken> {
        const [token] = await this.database(OAuthRefreshTokenTableName)
            .insert(tokenData)
            .returning('*');

        return this.mapDbRefreshTokenToOAuthRefreshToken(token);
    }

    async getRefreshToken(
        refreshToken: string,
    ): Promise<OAuthRefreshToken | null> {
        const token = await this.database(OAuthRefreshTokenTableName)
            .where({ refresh_token: refreshToken })
            .whereNull('revoked_at')
            .where('expires_at', '>', new Date())
            .first();

        if (!token) {
            return null;
        }

        return this.mapDbRefreshTokenToOAuthRefreshToken(token);
    }

    async revokeRefreshToken(refreshTokenUuid: string): Promise<void> {
        await this.database(OAuthRefreshTokenTableName)
            .where({ refresh_token_uuid: refreshTokenUuid })
            .update({ revoked_at: new Date() });
    }

    async updateRefreshTokenLastUsed(refreshTokenUuid: string): Promise<void> {
        await this.database(OAuthRefreshTokenTableName)
            .where({ refresh_token_uuid: refreshTokenUuid })
            .update({ last_used_at: new Date() });
    }

    // Cleanup operations
    async cleanupExpiredTokens(): Promise<void> {
        const now = new Date();

        // Clean up expired authorization codes
        await this.database(OAuthAuthorizationCodeTableName)
            .where('expires_at', '<', now)
            .del();

        // Clean up expired access tokens
        await this.database(OAuthAccessTokenTableName)
            .where('expires_at', '<', now)
            .del();

        // Clean up expired refresh tokens
        await this.database(OAuthRefreshTokenTableName)
            .where('expires_at', '<', now)
            .del();
    }

    private mapDbAuthorizationCodeToOAuthAuthorizationCode(
        dbCode: DbOAuthAuthorizationCode,
    ): OAuthAuthorizationCode {
        return {
            authorizationCodeUuid: dbCode.authorization_code_uuid,
            authorizationCode: dbCode.authorization_code,
            expiresAt: dbCode.expires_at,
            redirectUri: dbCode.redirect_uri,
            scopes: dbCode.scopes,
            userUuid: dbCode.user_uuid,
            organizationUuid: dbCode.organization_uuid,
            createdAt: dbCode.created_at,
            usedAt: dbCode.used_at,
            codeChallenge: dbCode.code_challenge,
            codeChallengeMethod: dbCode.code_challenge_method,
        };
    }

    private mapDbAccessTokenToOAuthAccessToken(
        dbToken: DbOAuthAccessToken,
    ): OAuthAccessToken {
        return {
            accessTokenUuid: dbToken.access_token_uuid,
            accessToken: dbToken.access_token,
            expiresAt: dbToken.expires_at,
            scopes: dbToken.scopes,
            userUuid: dbToken.user_uuid,
            organizationUuid: dbToken.organization_uuid,
            createdAt: dbToken.created_at,
            lastUsedAt: dbToken.last_used_at,
            revokedAt: dbToken.revoked_at,
            authorizationCodeUuid: dbToken.authorization_code_uuid,
        };
    }

    private mapDbRefreshTokenToOAuthRefreshToken(
        dbToken: DbOAuthRefreshToken,
    ): OAuthRefreshToken {
        return {
            refreshTokenUuid: dbToken.refresh_token_uuid,
            refreshToken: dbToken.refresh_token,
            expiresAt: dbToken.expires_at,
            scopes: dbToken.scopes,
            userUuid: dbToken.user_uuid,
            organizationUuid: dbToken.organization_uuid,
            createdAt: dbToken.created_at,
            lastUsedAt: dbToken.last_used_at,
            revokedAt: dbToken.revoked_at,
            accessTokenUuid: dbToken.access_token_uuid,
        };
    }
}
