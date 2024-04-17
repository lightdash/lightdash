import { subject } from '@casl/ability';
import { ForbiddenError, isUserWithOrg, SessionUser } from '@lightdash/common';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type GithubAppServiceArguments = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
    userModel: UserModel;
};

export class GithubAppService extends BaseService {
    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly userModel: UserModel;

    constructor(args: GithubAppServiceArguments) {
        super();
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
        this.userModel = args.userModel;
    }

    async getInstallationId(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        if (
            user.ability.cannot(
                'update',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.githubAppInstallationsModel.getInstallationId(
            user.organizationUuid,
        );
    }

    async upsertInstallation(
        userUuid: string,
        installationId: string,
        token: string,
        refreshToken: string,
    ) {
        const user = await this.userModel.findSessionUserByUUID(userUuid);

        if (!user || !isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        if (
            user.ability.cannot(
                'update',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const currentInstallationId =
            await this.githubAppInstallationsModel.findInstallationId(
                user.organizationUuid,
            );
        if (currentInstallationId) {
            await this.githubAppInstallationsModel.updateInstallation(
                user,
                installationId,
            );
        } else {
            await this.githubAppInstallationsModel.createInstallation(
                user,
                installationId,
                token,
                refreshToken,
            );
        }
    }

    async deleteAppInstallation(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new Error('User is not part of an organization');
        }
        if (
            user.ability.cannot(
                'update',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.githubAppInstallationsModel.deleteInstallation(
            user.organizationUuid,
        );
    }
}
