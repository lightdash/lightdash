import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type HomepageRecommendedActionKey,
    type RegisteredAccount,
    type SkippableHomepageRecommendedActionKey,
    type UUID,
} from '@lightdash/common';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../services/BaseService';
import { type HomepageRecommendedActionSkipsModel } from '../models/HomepageRecommendedActionSkipsModel';

export type HomepageRecommendedActionSkipsServiceArguments = {
    homepageRecommendedActionSkipsModel: Pick<
        HomepageRecommendedActionSkipsModel,
        'list' | 'create' | 'delete'
    >;
    projectModel: Pick<ProjectModel, 'getSummary'>;
};

export class HomepageRecommendedActionSkipsService extends BaseService {
    private readonly homepageRecommendedActionSkipsModel: HomepageRecommendedActionSkipsServiceArguments['homepageRecommendedActionSkipsModel'];

    private readonly projectModel: HomepageRecommendedActionSkipsServiceArguments['projectModel'];

    constructor(args: HomepageRecommendedActionSkipsServiceArguments) {
        super();
        this.homepageRecommendedActionSkipsModel =
            args.homepageRecommendedActionSkipsModel;
        this.projectModel = args.projectModel;
    }

    private static validateActionKey(
        actionKey: HomepageRecommendedActionKey | string,
    ): SkippableHomepageRecommendedActionKey {
        const skippableActionKey =
            SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS.find(
                (key) => key === actionKey,
            );
        if (!skippableActionKey) {
            throw new ParameterError(
                'This homepage recommended action cannot be skipped',
            );
        }

        return skippableActionKey;
    }

    private async getAuthorizedScope(
        account: RegisteredAccount,
        projectUuid: UUID | null,
    ): Promise<{ organizationUuid: UUID; projectUuid: UUID | null }> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        if (projectUuid !== null) {
            const project = await this.projectModel.getSummary(projectUuid);
            if (project.organizationUuid !== organizationUuid) {
                throw new ForbiddenError();
            }
        }

        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid: projectUuid ?? undefined,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return { organizationUuid, projectUuid };
    }

    async list(
        account: RegisteredAccount,
        projectUuid: UUID | null,
    ): Promise<SkippableHomepageRecommendedActionKey[]> {
        const scope = await this.getAuthorizedScope(account, projectUuid);
        return this.homepageRecommendedActionSkipsModel.list(scope);
    }

    async skip(
        account: RegisteredAccount,
        projectUuid: UUID | null,
        actionKey: HomepageRecommendedActionKey | string,
    ): Promise<void> {
        const validatedActionKey =
            HomepageRecommendedActionSkipsService.validateActionKey(actionKey);
        const scope = await this.getAuthorizedScope(account, projectUuid);
        await this.homepageRecommendedActionSkipsModel.create({
            ...scope,
            actionKey: validatedActionKey,
            createdByUserUuid: account.user.userUuid,
        });
    }

    async unskip(
        account: RegisteredAccount,
        projectUuid: UUID | null,
        actionKey: HomepageRecommendedActionKey | string,
    ): Promise<void> {
        const validatedActionKey =
            HomepageRecommendedActionSkipsService.validateActionKey(actionKey);
        const scope = await this.getAuthorizedScope(account, projectUuid);
        await this.homepageRecommendedActionSkipsModel.delete({
            ...scope,
            actionKey: validatedActionKey,
        });
    }
}
