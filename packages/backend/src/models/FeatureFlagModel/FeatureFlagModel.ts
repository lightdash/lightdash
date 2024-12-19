import { FeatureFlag, FeatureFlags, LightdashUser } from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import { isFeatureFlagEnabled } from '../../postHog';

export type FeatureFlagLogicArgs = {
    user?: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>;
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
        if (!handler) {
            throw new Error(
                `No logic defined for feature flag ID: ${args.featureFlagId}`,
            );
        }

        return handler(args);
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
