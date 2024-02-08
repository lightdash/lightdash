import { subject } from '@casl/ability';
import { ForbiddenError, isUserWithOrg, SessionUser } from '@lightdash/common';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';

type Dependencies = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
};

export class GithubAppService {
    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    constructor(deps: Dependencies) {
        this.githubAppInstallationsModel = deps.githubAppInstallationsModel;
    }

    async createAppInstallation(user: SessionUser, installationId: string) {
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
        return this.githubAppInstallationsModel.createInstallation(
            user,
            installationId,
        );
    }

    async updateAppInstallation(user: SessionUser, installationId: string) {
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
        return this.githubAppInstallationsModel.updateInstallation(
            user,
            installationId,
        );
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
