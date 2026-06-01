import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    PullRequestState,
    PullRequestWithStatus,
    SessionUser,
} from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { BaseService } from '../BaseService';

type PullRequestsServiceArguments = {
    lightdashConfig: LightdashConfig;
    pullRequestsModel: PullRequestsModel;
    featureFlagModel: FeatureFlagModel;
};

export class PullRequestsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor(args: PullRequestsServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.pullRequestsModel = args.pullRequestsModel;
        this.featureFlagModel = args.featureFlagModel;
    }

    private async assertFeatureEnabled(user: SessionUser): Promise<void> {
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.PullRequests,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Pull requests are not enabled for this organization',
            );
        }
    }

    async getPullRequests(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<PullRequestWithStatus[]>> {
        await this.assertFeatureEnabled(user);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { data: pullRequests, pagination } =
            await this.pullRequestsModel.getByProject(
                projectUuid,
                paginateArgs,
            );

        // Live title/state resolution from the provider API is added in a later
        // change; for now expose the stored rows with placeholder metadata.
        return {
            data: pullRequests.map((pr) => ({
                ...pr,
                title: `Pull request #${pr.prNumber}`,
                state: PullRequestState.OPEN,
            })),
            pagination,
        };
    }
}
