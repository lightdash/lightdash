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
            [FeatureFlags.UseSqlPivotResults]:
                this.getUseSqlPivotResults.bind(this),
            [FeatureFlags.DashboardComments]:
                this.getDashboardComments.bind(this),
            [FeatureFlags.EditYamlInUi]: this.getEditYamlInUiEnabled.bind(this),
            [FeatureFlags.Maps]: this.getMapsEnabled.bind(this),
            [FeatureFlags.ShowExecutionTime]:
                this.getShowExecutionTimeEnabled.bind(this),
            [FeatureFlags.NestedSpacesPermissions]:
                this.getNestedSpacesPermissionsEnabled.bind(this),
            [FeatureFlags.AdminChangeNotifications]:
                this.getAdminChangeNotifications.bind(this),
            [FeatureFlags.SavedMetricsTree]:
                this.getSavedMetricsTreeEnabled.bind(this),
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
        user: Pick<
            LightdashUser,
            'userUuid' | 'organizationUuid' | 'organizationName'
        >,
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
            this.lightdashConfig.groups.enabled ??
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

    private async getUseSqlPivotResults({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.query.useSqlPivotResults ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.UseSqlPivotResults,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
                          throwOnTimeout: false,
                          timeoutMilliseconds: 500,
                      },
                      true,
                  )
                : true);
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getDashboardComments({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        if (!this.lightdashConfig.dashboardComments.enabled) {
            return {
                id: featureFlagId,
                enabled: false,
            };
        }

        const enabled = user
            ? await isFeatureFlagEnabled(
                  FeatureFlags.DashboardComments,
                  {
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  },
                  {
                      throwOnTimeout: false,
                      timeoutMilliseconds: 500,
                  },
                  true,
              )
            : true;

        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getEditYamlInUiEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.editYamlInUi.enabled,
        };
    }

    private async getMapsEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.maps.enabled ??
            (user
                ? await isFeatureFlagEnabled(FeatureFlags.Maps, {
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  })
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getShowExecutionTimeEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.query.showExecutionTime ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.ShowExecutionTime,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
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

    private async getNestedSpacesPermissionsEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.nestedSpacesPermissions.enabled,
        };
    }

    private async getAdminChangeNotifications({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.adminChangeNotifications.enabled ||
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.AdminChangeNotifications,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      {
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

    private async getSavedMetricsTreeEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.savedMetricsTree.enabled ??
            (user
                ? await isFeatureFlagEnabled(FeatureFlags.SavedMetricsTree, {
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  })
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }
}
