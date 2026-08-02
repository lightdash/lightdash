import { Knex } from 'knex';
import {
    UserOAuthGrantProvider,
    UserOAuthGrantsTableName,
} from '../database/entities/userOAuthGrants';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { UserModel } from './UserModel';

type UserOAuthGrantsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
    userModel: Pick<UserModel, 'getRefreshToken'>;
};

type UpsertUserOAuthGrant = {
    userUuid: string;
    provider: UserOAuthGrantProvider;
    subject: string;
    email: string;
    scopes: string[];
    refreshToken: string;
};

export class UserOAuthGrantsModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly userModel: Pick<UserModel, 'getRefreshToken'>;

    constructor(args: UserOAuthGrantsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
        this.userModel = args.userModel;
    }

    async upsertGrant(grant: UpsertUserOAuthGrant): Promise<void> {
        const encryptedRefreshToken = this.encryptionUtil.encrypt(
            grant.refreshToken,
        );
        const scopes = [...new Set(grant.scopes)];
        await this.database(UserOAuthGrantsTableName)
            .insert({
                user_uuid: grant.userUuid,
                provider: grant.provider,
                provider_subject: grant.subject,
                provider_email: grant.email,
                scopes,
                encrypted_refresh_token: encryptedRefreshToken,
            })
            .onConflict(['user_uuid', 'provider'])
            .merge({
                provider_subject: grant.subject,
                provider_email: grant.email,
                scopes: this.database.raw(
                    `ARRAY(SELECT DISTINCT unnest(??.scopes || EXCLUDED.scopes))`,
                    [UserOAuthGrantsTableName],
                ),
                encrypted_refresh_token: encryptedRefreshToken,
                updated_at: new Date(),
            });
    }

    async getRefreshToken(
        userUuid: string,
        provider: UserOAuthGrantProvider,
    ): Promise<string> {
        const grant = await this.database(UserOAuthGrantsTableName)
            .where({ user_uuid: userUuid, provider })
            .first('encrypted_refresh_token');

        if (grant) {
            return this.encryptionUtil.decrypt(grant.encrypted_refresh_token);
        }

        return this.userModel.getRefreshToken(userUuid, provider);
    }

    async deleteGrant(
        userUuid: string,
        provider: UserOAuthGrantProvider,
    ): Promise<void> {
        await this.database(UserOAuthGrantsTableName)
            .where({ user_uuid: userUuid, provider })
            .delete();
    }
}
