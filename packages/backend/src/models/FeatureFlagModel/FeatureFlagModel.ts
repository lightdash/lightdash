import {
    FeatureFlag,
    FeatureFlags,
    isFeatureFlags,
    LightdashUser,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import { isFeatureFlagEnabled } from '../../postHog';

export type FeatureFlagLogicArgs = {
    user?: Pick<
        LightdashUser,
        'userUuid' | 'organizationUuid' | 'organizationName'
    >;
    featureFlagId: string;
};

export class FeatureFlagModel {
    protected readonly database: Knex;

    protected readonly lightdashConfig: LightdashConfig;

    protected featureFlagHandlers: Record<
        string,
        (args: FeatureFlagLogicArgs) => Promise<FeatureFlag>
    >;

    constructor(args: { database: Knex; lightdashConfig: LightdashConfig }) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        // Initialize the handlers for feature flag logic
        this.featureFlagHandlers = {
            [FeatureFlags.UserGroupsEnabled]:
                this.getUserGroupsEnabled.bind(this),
        };
    }

    public async get(args: FeatureFlagLogicArgs): Promise<FeatureFlag> {
        const handler = this.featureFlagHandlers[args.featureFlagId];
        if (handler) {
            return handler(args);
        }
        // Default to check Posthog feature flag
        if (args.user && isFeatureFlags(args.featureFlagId)) {
            return FeatureFlagModel.getPosthogFeatureFlag(
                args.user,
                args.featureFlagId,
            );
        }
        throw new NotFoundError(`Feature flag ${args.featureFlagId} not found`);
    }

    static async getPosthogFeatureFlag(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
        featureFlagId: FeatureFlags,
    ): Promise<FeatureFlag> {
        const enabled = await isFeatureFlagEnabled(featureFlagId, {
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        });
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getUserGroupsEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.groups.enabled ||
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.UserGroupsEnabled,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
                          // because we are checking this in the health check, we don't want to throw an error
                          // nor do we want to wait too long
                          throwOnTimeout: false,
                          timeoutMilliseconds: 500,
                      },
                  )
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }
}
