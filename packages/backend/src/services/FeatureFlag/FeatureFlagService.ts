import { subject } from '@casl/ability';
import {
    ALL_FEATURE_FLAG_IDS,
    ForbiddenError,
    isAccount,
    isKnownFeatureFlagId,
    NotFoundError,
    ParameterError,
    type FeatureFlag,
    type LightdashUser,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import pLimit from 'p-limit';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../BaseService';

const LIST_CONCURRENCY = 5;

type FeatureFlagServiceArguments = {
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
};

export class FeatureFlagService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor(args: FeatureFlagServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.featureFlagModel = args.featureFlagModel;
    }

    get({
        user,
        featureFlagId,
    }: {
        user?: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>;
        featureFlagId: string;
    }) {
        return this.featureFlagModel.get({ user, featureFlagId });
    }

    // Returns the organization the caller is allowed to manage.
    private assertOrganizationAdmin(
        accountOrUser: RegisteredAccount | SessionUser,
    ): string {
        const organizationUuid = isAccount(accountOrUser)
            ? accountOrUser.organization.organizationUuid
            : accountOrUser.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (
            this.createAuditedAbility(accountOrUser).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    ensureOrganizationOverrideEnabled({
        user,
        featureFlagId,
    }: {
        user: SessionUser;
        featureFlagId: string;
    }) {
        const organizationUuid = this.assertOrganizationAdmin(user);
        return this.featureFlagModel.ensureOrganizationOverrideEnabled(
            featureFlagId,
            organizationUuid,
        );
    }

    /**
     * Preview/Okteto environments only: lets QA list and toggle every flag for
     * their organization without a redeploy.
     */
    private assertCanManageFlags(account: RegisteredAccount): string {
        if (!this.lightdashConfig.previewFeatureFlags.enabled) {
            throw new NotFoundError(
                'Feature flag management is only available in preview environments',
            );
        }
        return this.assertOrganizationAdmin(account);
    }

    private static assertKnownFlag(featureFlagId: string): void {
        if (!isKnownFeatureFlagId(featureFlagId)) {
            throw new ParameterError(`Unknown feature flag "${featureFlagId}"`);
        }
    }

    private static toFlagUser(
        account: RegisteredAccount,
    ): Pick<LightdashUser, 'userUuid' | 'organizationUuid'> {
        return {
            userUuid: account.user.userUuid,
            organizationUuid: account.organization.organizationUuid,
        };
    }

    async list(account: RegisteredAccount): Promise<FeatureFlag[]> {
        this.assertCanManageFlags(account);
        const user = FeatureFlagService.toFlagUser(account);
        // Bounded: resolving a flag costs up to three queries, and the preview
        // connection pool also serves the rest of the app.
        const limit = pLimit(LIST_CONCURRENCY);
        return Promise.all(
            ALL_FEATURE_FLAG_IDS.map((featureFlagId) =>
                limit(() =>
                    this.featureFlagModel.get(
                        { user, featureFlagId },
                        { recordCheck: false },
                    ),
                ),
            ),
        );
    }

    async setOrganizationOverride({
        account,
        featureFlagId,
        enabled,
    }: {
        account: RegisteredAccount;
        featureFlagId: string;
        enabled: boolean;
    }): Promise<FeatureFlag> {
        const organizationUuid = this.assertCanManageFlags(account);
        FeatureFlagService.assertKnownFlag(featureFlagId);
        await this.featureFlagModel.upsertOrganizationOverride(
            featureFlagId,
            organizationUuid,
            enabled,
        );
        return this.featureFlagModel.get({
            user: FeatureFlagService.toFlagUser(account),
            featureFlagId,
        });
    }

    async deleteOrganizationOverride({
        account,
        featureFlagId,
    }: {
        account: RegisteredAccount;
        featureFlagId: string;
    }): Promise<FeatureFlag> {
        const organizationUuid = this.assertCanManageFlags(account);
        FeatureFlagService.assertKnownFlag(featureFlagId);
        await this.featureFlagModel.deleteOrganizationOverride(
            featureFlagId,
            organizationUuid,
        );
        return this.featureFlagModel.get({
            user: FeatureFlagService.toFlagUser(account),
            featureFlagId,
        });
    }
}
