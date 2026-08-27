import {
    LightdashUserWithOrg, // pragma: allowlist secret
    NotFoundError,
    UnexpectedServerError,
    type LinearInstallation,
} from '@lightdash/common'; // pragma: allowlist secret
import { Knex } from 'knex';
import { LinearAppInstallationTableName } from '../../database/entities/linearAppInstallation';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type LinearAppInstallationsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export type LinearAuth = {
    token: string;
    refreshToken: string | null;
};

export class LinearAppInstallationsModel {
    readonly database: Knex;

    readonly encryptionUtil: EncryptionUtil;

    constructor(args: LinearAppInstallationsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    private decrypt(value: Buffer, label: string): string {
        try {
            return this.encryptionUtil.decrypt(value);
        } catch {
            throw new UnexpectedServerError(`Failed to decrypt ${label}`);
        }
    }

    async findInstallation(
        organizationUuid: string,
    ): Promise<LinearInstallation | undefined> {
        const installation = await this.database(LinearAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .first();

        if (!installation) {
            return undefined;
        }

        return {
            organizationUuid: installation.organization_uuid,
            organizationName: installation.linear_organization_name,
            organizationUrlKey: installation.linear_organization_url_key,
        };
    }

    async getInstallation(
        organizationUuid: string,
    ): Promise<LinearInstallation> {
        const installation = await this.findInstallation(organizationUuid);
        if (!installation) {
            throw new NotFoundError('Linear installation not found');
        }
        return installation;
    }

    async createInstallation(
        user: LightdashUserWithOrg, // pragma: allowlist secret
        args: {
            installationId: string;
            token: string;
            refreshToken: string | null;
            organizationName: string;
            organizationUrlKey: string;
        },
    ): Promise<void> {
        await this.database(LinearAppInstallationTableName).insert({
            organization_uuid: user.organizationUuid,
            encrypted_installation_id: this.encryptionUtil.encrypt(
                args.installationId,
            ),
            encrypted_access_token: this.encryptionUtil.encrypt(args.token),
            encrypted_refresh_token: args.refreshToken
                ? this.encryptionUtil.encrypt(args.refreshToken)
                : null,
            linear_organization_name: args.organizationName,
            linear_organization_url_key: args.organizationUrlKey,
            created_by_user_uuid: user.userUuid,
            updated_by_user_uuid: user.userUuid,
        });
    }

    async updateInstallation(
        user: LightdashUserWithOrg, // pragma: allowlist secret
        args: {
            installationId: string;
            token: string;
            refreshToken: string | null;
            organizationName: string;
            organizationUrlKey: string;
        },
    ): Promise<void> {
        await this.database(LinearAppInstallationTableName)
            .where({ organization_uuid: user.organizationUuid })
            .update({
                encrypted_installation_id: this.encryptionUtil.encrypt(
                    args.installationId,
                ),
                encrypted_access_token: this.encryptionUtil.encrypt(args.token),
                encrypted_refresh_token: args.refreshToken
                    ? this.encryptionUtil.encrypt(args.refreshToken)
                    : null,
                linear_organization_name: args.organizationName,
                linear_organization_url_key: args.organizationUrlKey,
                updated_by_user_uuid: user.userUuid,
                updated_at: new Date(),
            });
    }

    async getAuth(organizationUuid: string): Promise<LinearAuth> {
        const auth = await this.database(LinearAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .select(['encrypted_access_token', 'encrypted_refresh_token'])
            .first();

        if (auth === undefined) {
            throw new NotFoundError(
                `Unable to find Linear authentication for organization ${organizationUuid}`,
            );
        }

        return {
            token: this.decrypt(auth.encrypted_access_token, 'access token'),
            refreshToken: auth.encrypted_refresh_token
                ? this.decrypt(auth.encrypted_refresh_token, 'refresh token')
                : null,
        };
    }

    async updateAuth(
        organizationUuid: string,
        token: string,
        refreshToken: string | null,
    ): Promise<void> {
        await this.database(LinearAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                encrypted_access_token: this.encryptionUtil.encrypt(token),
                encrypted_refresh_token: refreshToken
                    ? this.encryptionUtil.encrypt(refreshToken)
                    : null,
                updated_at: new Date(),
            });
    }

    async deleteInstallation(organizationUuid: string): Promise<void> {
        await this.database(LinearAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
    }
}
