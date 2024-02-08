import {
    LightdashUserWithOrg,
    NotFoundError,
    UnexpectedServerError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GithubAppInstallationTableName } from '../../database/entities/githubAppInstallation';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';

type Dependencies = {
    database: Knex;
    encryptionService: EncryptionService;
};

export class GithubAppInstallationsModel {
    readonly database: Knex;

    readonly encryptionService: EncryptionService;

    constructor(deps: Dependencies) {
        this.database = deps.database;
        this.encryptionService = deps.encryptionService;
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
            installationId = this.encryptionService.decrypt(
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
    ) {
        await this.database(GithubAppInstallationTableName).insert({
            organization_uuid: user.organizationUuid,
            encrypted_installation_id:
                this.encryptionService.encrypt(installationId),
            created_by_user_uuid: user.userUuid,
            updated_by_user_uuid: user.userUuid,
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
                    this.encryptionService.encrypt(installationId),
                updated_by_user_uuid: user.userUuid,
                updated_at: new Date(),
            });
    }

    async deleteInstallation(organizationUuid: string) {
        await this.database(GithubAppInstallationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
    }
}
