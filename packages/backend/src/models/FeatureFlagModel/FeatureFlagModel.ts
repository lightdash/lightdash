import {
    FeatureFlag,
    FeatureFlags,
    isFeatureFlags,
    LightdashUser,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../../config/parseConfig';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../../database/entities/featureFlags';
import Logger from '../../logging/logger';
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
            [FeatureFlags.ShowExecutionTime]:
                this.getShowExecutionTimeEnabled.bind(this),
            [FeatureFlags.SavedMetricsTree]:
                this.getSavedMetricsTreeEnabled.bind(this),
            [FeatureFlags.DefaultUserSpaces]:
                this.getDefaultUserSpacesEnabled.bind(this),
            [FeatureFlags.GoogleChatEnabled]:
                this.getGoogleChatEnabled.bind(this),
            [FeatureFlags.UserImpersonation]:
                this.getUserImpersonationEnabled.bind(this),
            [FeatureFlags.ChangeChartExplore]:
                this.getChangeChartExploreEnabled.bind(this),
            [FeatureFlags.ShowHideRows]: this.getShowHideRowsEnabled.bind(this),
            [FeatureFlags.MetricDashboardFilters]:
                this.getMetricDashboardFiltersEnabled.bind(this),
            [FeatureFlags.ShowHideColumns]:
                this.getShowHideColumnsEnabled.bind(this),
            [FeatureFlags.EnableTimezoneSupport]:
                this.getEnableTimezoneSupportEnabled.bind(this),
            [FeatureFlags.EnableDataApps]:
                this.getEnableDataAppsEnabled.bind(this),
        };
    }

    public async get(args: FeatureFlagLogicArgs): Promise<FeatureFlag> {
        // 1. Check env var override (self-hosted escape hatch, enable-only)
        if (this.lightdashConfig.enabledFeatureFlags.has(args.featureFlagId)) {
            return { id: args.featureFlagId, enabled: true };
        }

        // 2. Check per-flag config handlers
        const handler = this.featureFlagHandlers[args.featureFlagId];
        if (handler) {
            return handler(args);
        }

        // 3. Check database (user override > org override > flag default)
        try {
            const dbResult = await this.getFromDatabase(args);
            if (dbResult !== null) {
                return dbResult;
            }
        } catch (e) {
            Logger.warn(
                `Failed to check feature flag ${args.featureFlagId} from database, falling through to PostHog: ${e}`,
            );
        }

        // 4. Fallback to PostHog (temporary, will be removed after migration)
        if (args.user && isFeatureFlags(args.featureFlagId)) {
            return FeatureFlagModel.getPosthogFeatureFlag(
                args.user,
                args.featureFlagId,
            );
        }

        // Unknown flags default to disabled.
        // See: GLITCH-331
        return { id: args.featureFlagId, enabled: false };
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

    private async getShowExecutionTimeEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.query.showExecutionTime ?? false,
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

    private async getDefaultUserSpacesEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.defaultUserSpaces.enabled ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.DefaultUserSpaces,
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                          organizationName: user.organizationName,
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

    private async getGoogleChatEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.googleChat.enabled ||
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.GoogleChatEnabled,
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

    private async getUserImpersonationEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.userImpersonation.enabled ??
            (user
                ? await isFeatureFlagEnabled(FeatureFlags.UserImpersonation, {
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  })
                : false);
        return {
            id: featureFlagId,
            enabled,
        };
    }

    private async getChangeChartExploreEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.changeChartExplore.enabled ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.ChangeChartExplore,
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

    private async getShowHideRowsEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.showHideRows.enabled ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.ShowHideRows,
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

    private async getMetricDashboardFiltersEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.metricDashboardFilters.enabled ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.MetricDashboardFilters,
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

    private async getShowHideColumnsEnabled({
        user,
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        const enabled =
            this.lightdashConfig.showHideColumns.enabled ??
            (user
                ? await isFeatureFlagEnabled(
                      FeatureFlags.ShowHideColumns,
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

    // Config-only (no PostHog) to avoid needing a user context — this flag
    // is checked in the query execution path where only userUuid is available,
    // and loading the full user would add an extra DB query on every query.
    // It also needs to work for embed users who don't have a user record.
    private async getEnableTimezoneSupportEnabled({
        featureFlagId,
    }: FeatureFlagLogicArgs) {
        return {
            id: featureFlagId,
            enabled: this.lightdashConfig.query.enableTimezoneSupport ?? false,
        };
    }

    private async getEnableDataAppsEnabled(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag> {
        if (this.lightdashConfig.appRuntime.enabled) {
            return { id: args.featureFlagId, enabled: true };
        }
        // Fall through to database check (pass full args for user/org override resolution)
        const dbResult = await this.getFromDatabase(args);
        return dbResult ?? { id: args.featureFlagId, enabled: false };
    }

    private async getFromDatabase(
        args: FeatureFlagLogicArgs,
    ): Promise<FeatureFlag | null> {
        const flag = await this.database(FeatureFlagsTableName)
            .where('flag_id', args.featureFlagId)
            .first();

        if (!flag) {
            return null;
        }

        // Priority: user override > org override > flag default
        if (args.user?.userUuid) {
            const userOverride = await this.database(
                FeatureFlagOverridesTableName,
            )
                .where('flag_id', args.featureFlagId)
                .where('user_uuid', args.user.userUuid)
                .first();
            if (userOverride) {
                return {
                    id: args.featureFlagId,
                    enabled: userOverride.enabled,
                };
            }
        }

        if (args.user?.organizationUuid) {
            const orgOverride = await this.database(
                FeatureFlagOverridesTableName,
            )
                .where('flag_id', args.featureFlagId)
                .where('organization_uuid', args.user.organizationUuid)
                .whereNull('user_uuid')
                .first();
            if (orgOverride) {
                return {
                    id: args.featureFlagId,
                    enabled: orgOverride.enabled,
                };
            }
        }

        return { id: args.featureFlagId, enabled: flag.default_enabled };
    }
}
