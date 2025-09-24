import {
    LightdashUserWithOrg,
    NotFoundError,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GitlabAppInstallationTableName } from '../../database/entities/gitlabAppInstallation';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type GitlabAppInstallationsModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class GitlabAppInstallationsModel {
    readonly database: Knex;

    readonly encryptionUtil: EncryptionUtil;

    constructor(args: GitlabAppInstallationsModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    async findInstallationId(
        organizationUuid: string,
    ): Promise<string | undefined> {
        const installation = await this.database(GitlabAppInstallationTableName)
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
        const installationId = await this.findInstallationId(organizationUuid);

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
        gitlabInstanceUrl: string = 'https://gitlab.com',
    ) {
        await this.database(GitlabAppInstallationTableName).insert({
            organization_uuid: user.organizationUuid,
            encrypted_installation_id:
                this.encryptionUtil.encrypt(installationId),
            created_by_user_uuid: user.userUuid,
            updated_by_user_uuid: user.userUuid,
            auth_token: token,
            refresh_token: refreshToken,
            gitlab_instance_url: gitlabInstanceUrl,
        });
    }

    async updateInstallation(
        user: LightdashUserWithOrg,
        installationId: string,
    ) {
        await this.database(GitlabAppInstallationTableName)
            .where({ organization_uuid: user.organizationUuid })
            .update({
                encrypted_installation_id:
                    this.encryptionUtil.encrypt(installationId),
                updated_by_user_uuid: user.userUuid,
                updated_at: new Date(),
            });
    }

    async getAuth(organizationUuid: string) {
        const auth = await this.database(GitlabAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .select(['auth_token', 'refresh_token', 'gitlab_instance_url'])
            .first();

        if (auth === undefined)
            throw new NotFoundError(
                `Unable to find GitLab authentication for organization ${organizationUuid}`,
            );
        return {
            token: auth.auth_token,
            refreshToken: auth.refresh_token,
            gitlabInstanceUrl: auth.gitlab_instance_url,
        };
    }

    async updateAuth(
        organizationUuid: string,
        token: string,
        refreshToken: string,
    ) {
        await this.database(GitlabAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                auth_token: token,
                refresh_token: refreshToken,
                updated_at: new Date(),
            });
    }

    async deleteInstallation(organizationUuid: string) {
        await this.database(GitlabAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
    }
}
