import {
    LightdashUserWithOrg,
    NotFoundError,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GithubAppInstallationTableName } from '../../database/entities/githubAppInstallation';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type GithubAppInstallationsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class GithubAppInstallationsModel {
    readonly database: Knex;

    readonly encryptionUtil: EncryptionUtil;

    constructor(args: GithubAppInstallationsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    async findInstallationId(
        organizationUuid: string,
    ): Promise<string | undefined> {
        const installation = await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .first();

        if (!installation) {
            return undefined;
        }

        let installationId: string;
        try {
            installationId = this.encryptionUtil.decrypt(
                installation.encrypted_installation_id,
            );
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to decrypt installation id',
            );
        }

        return installationId;
    }

    async getInstallationId(
        organizationUuid: string,
    ): Promise<string | undefined> {
        const installationId = this.findInstallationId(organizationUuid);

        if (!installationId) {
            throw new NotFoundError('Installation not found');
        }

        return installationId;
    }

    async createInstallation(
        user: LightdashUserWithOrg,
        installationId: string,
        token: string,
        refreshToken: string,
    ) {
        await this.database(GithubAppInstallationTableName).insert({
            organization_uuid: user.organizationUuid,
            encrypted_installation_id:
                this.encryptionUtil.encrypt(installationId),
            created_by_user_uuid: user.userUuid,
            updated_by_user_uuid: user.userUuid,
            auth_token: token,
            refresh_token: refreshToken,
        });
    }

    async updateInstallation(
        user: LightdashUserWithOrg,
        installationId: string,
    ) {
        await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: user.organizationUuid })
            .update({
                encrypted_installation_id:
                    this.encryptionUtil.encrypt(installationId),
                updated_by_user_uuid: user.userUuid,
                updated_at: new Date(),
            });
    }

    async getAuth(organizationUuid: string) {
        const auth = await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .select(['auth_token', 'refresh_token'])
            .first();

        if (auth === undefined)
            throw new NotFoundError(
                `Unable to find Github authentication for organization ${organizationUuid}`,
            );
        return {
            token: auth.auth_token,
            refreshToken: auth.refresh_token,
        };
    }

    async updateAuth(
        organizationUuid: string,
        token: string,
        refreshToken: string,
    ) {
        await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                auth_token: token,
                refresh_token: refreshToken,
                updated_at: new Date(),
            });
    }

    async deleteInstallation(organizationUuid: string) {
        await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
    }
}
