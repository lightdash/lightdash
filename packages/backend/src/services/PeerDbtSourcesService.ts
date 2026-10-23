import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    validateProjectDbtSourceName,
    type Account,
    type AddSharedDbtSource,
    type DbtRepositorySummary,
    type PeerDbtSourceSummary,
    type UpdatePeerDbtSource,
} from '@lightdash/common';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import {
    getPeerDbtSourcesEnabled,
    hasPeerDbtSourcesOperation,
    withPeerDbtSourcesOperation,
} from '../utils/peerDbtSourcesOperation';
import { BaseService } from './BaseService';
import { type ProjectDbtSourcesService } from './ProjectDbtSourcesService';

export class PeerDbtSourcesService extends BaseService {
    constructor(
        private readonly args: {
            projectModel: Pick<
                ProjectModel,
                'getSummary' | 'getDbtSourceIdentity'
            >;
            projectDbtSourcesModel: ProjectDbtSourcesModel;
            projectDbtSourcesService: Pick<
                ProjectDbtSourcesService,
                'getProjectDbtSources'
            >;
            featureFlagModel: Pick<FeatureFlagModel, 'get'>;
        },
    ) {
        super();
    }

    private async checkAccess(
        account: Account,
        projectUuid: string,
        action: 'view' | 'manage',
    ): Promise<string> {
        const { organizationUuid } =
            await this.args.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                action,
                subject('Project', { organizationUuid, projectUuid }),
            )
        )
            throw new ForbiddenError();
        return organizationUuid;
    }

    private async withPeerOperation<T>(
        organizationUuid: string,
        callback: () => Promise<T>,
    ): Promise<T> {
        const run = async () => {
            if (!getPeerDbtSourcesEnabled())
                throw new ForbiddenError('Peer dbt sources are not enabled');
            return callback();
        };
        if (hasPeerDbtSourcesOperation()) return run();
        const { enabled } = await this.args.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.PeerDbtSources,
        });
        return withPeerDbtSourcesOperation(enabled, run);
    }

    async listPeers(
        account: Account,
        projectUuid: string,
    ): Promise<PeerDbtSourceSummary[]> {
        const organizationUuid = await this.checkAccess(
            account,
            projectUuid,
            'view',
        );
        return this.withPeerOperation(organizationUuid, async () => {
            const [sources, settings] = await Promise.all([
                this.args.projectDbtSourcesService.getProjectDbtSources(
                    account,
                    projectUuid,
                ),
                this.args.projectDbtSourcesModel.peers.getSettings(projectUuid),
            ]);
            return sources.flatMap((source) => {
                const peer = settings.get(source.projectDbtSourceUuid);
                return peer ? [{ ...source, peer }] : [];
            });
        });
    }

    async updatePeer(
        account: Account,
        projectUuid: string,
        sourceUuid: string,
        data: UpdatePeerDbtSource,
    ): Promise<void> {
        const organizationUuid = await this.checkAccess(
            account,
            projectUuid,
            'manage',
        );
        return this.withPeerOperation(organizationUuid, async () => {
            await this.args.projectDbtSourcesModel.peers.updatePeer(
                projectUuid,
                sourceUuid,
                data,
            );
        });
    }

    async setShared(
        account: Account,
        projectUuid: string,
        repositoryUuid: string,
        isShared: boolean,
    ): Promise<void> {
        const organizationUuid = await this.checkAccess(
            account,
            projectUuid,
            'manage',
        );
        return this.withPeerOperation(organizationUuid, async () => {
            await this.args.projectDbtSourcesModel.peers.setShared(
                organizationUuid,
                projectUuid,
                repositoryUuid,
                isShared,
            );
        });
    }

    async listShared(
        account: Account,
        projectUuid: string,
    ): Promise<DbtRepositorySummary[]> {
        const organizationUuid = await this.checkAccess(
            account,
            projectUuid,
            'view',
        );
        return this.withPeerOperation(organizationUuid, async () =>
            this.args.projectDbtSourcesModel.peers.listShared(organizationUuid),
        );
    }

    async addShared(
        account: Account,
        projectUuid: string,
        data: AddSharedDbtSource,
    ): Promise<string> {
        const organizationUuid = await this.checkAccess(
            account,
            projectUuid,
            'manage',
        );
        return this.withPeerOperation(organizationUuid, async () => {
            const nameError = validateProjectDbtSourceName(data.name);
            if (nameError) throw new ParameterError(nameError);
            if (!['publish', 'dependency_only'].includes(data.membershipRole))
                throw new ParameterError('Invalid membership role');
            if (!['git_refresh', 'ci_managed'].includes(data.refreshPolicy))
                throw new ParameterError('Invalid refresh policy');
            const primary =
                await this.args.projectModel.getDbtSourceIdentity(projectUuid);
            if (data.name === primary.dbtSourceName)
                throw new ParameterError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            return this.args.projectDbtSourcesModel.peers.addShared(
                organizationUuid,
                projectUuid,
                data,
            );
        });
    }
}
