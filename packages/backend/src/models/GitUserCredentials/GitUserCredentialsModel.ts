import { UnexpectedServerError } from '@lightdash/common';
import { Knex } from 'knex';
import { GitUserCredentialsTableName } from '../../database/entities/gitUserCredentials';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export type GitUserCredential = {
    userUuid: string;
    organizationUuid: string;
    provider: string;
    providerLogin: string;
    providerUserId: string;
    token: string;
    refreshToken: string;
    createdAt: Date;
};

type UpsertGitUserCredential = Omit<GitUserCredential, 'createdAt'>;

type GitUserCredentialsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class GitUserCredentialsModel {
    readonly database: Knex;

    readonly encryptionUtil: EncryptionUtil;

    constructor(args: GitUserCredentialsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    async findCredential(
        userUuid: string,
        organizationUuid: string,
        provider: string,
    ): Promise<GitUserCredential | undefined> {
        const row = await this.database(GitUserCredentialsTableName)
            .where({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                provider,
            })
            .first();

        if (!row) {
            return undefined;
        }

        let token: string;
        let refreshToken: string;
        try {
            token = this.encryptionUtil.decrypt(row.encrypted_auth_token);
            refreshToken = this.encryptionUtil.decrypt(
                row.encrypted_refresh_token,
            );
        } catch {
            throw new UnexpectedServerError(
                'Failed to decrypt git user credential',
            );
        }

        return {
            userUuid: row.user_uuid,
            organizationUuid: row.organization_uuid,
            provider: row.provider,
            providerLogin: row.provider_login,
            providerUserId: row.provider_user_id,
            token,
            refreshToken,
            createdAt: row.created_at,
        };
    }

    async upsertCredential(credential: UpsertGitUserCredential): Promise<void> {
        // Encrypt once and reuse for both the insert and the conflict-merge —
        // each encrypt() call uses a fresh IV, so calling it twice would store
        // two different ciphertexts for the same value.
        const encryptedAuthToken = this.encryptionUtil.encrypt(
            credential.token,
        );
        const encryptedRefreshToken = this.encryptionUtil.encrypt(
            credential.refreshToken,
        );
        await this.database(GitUserCredentialsTableName)
            .insert({
                user_uuid: credential.userUuid,
                organization_uuid: credential.organizationUuid,
                provider: credential.provider,
                provider_login: credential.providerLogin,
                provider_user_id: credential.providerUserId,
                encrypted_auth_token: encryptedAuthToken,
                encrypted_refresh_token: encryptedRefreshToken,
            })
            .onConflict(['user_uuid', 'organization_uuid', 'provider'])
            .merge({
                provider_login: credential.providerLogin,
                provider_user_id: credential.providerUserId,
                encrypted_auth_token: encryptedAuthToken,
                encrypted_refresh_token: encryptedRefreshToken,
                updated_at: new Date(),
            });
    }

    async updateTokens(
        userUuid: string,
        organizationUuid: string,
        provider: string,
        token: string,
        refreshToken: string,
    ): Promise<void> {
        await this.database(GitUserCredentialsTableName)
            .where({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                provider,
            })
            .update({
                encrypted_auth_token: this.encryptionUtil.encrypt(token),
                encrypted_refresh_token:
                    this.encryptionUtil.encrypt(refreshToken),
                updated_at: new Date(),
            });
    }

    async deleteCredential(
        userUuid: string,
        organizationUuid: string,
        provider: string,
    ): Promise<void> {
        await this.database(GitUserCredentialsTableName)
            .where({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                provider,
            })
            .delete();
    }
}
