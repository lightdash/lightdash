import {
    resolveQueryTimezone,
    FeatureFlags,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardFilterRule,
    getDefaultStartOfWeek,
    SupportedDbtAdapter,
    getFilterBoundaryFieldContext,
    type FilterableItem,
    type FilterBoundaryContext,
} from '@lightdash/common';
import useFiltersContext from '../../../components/common/Filters/useFiltersContext';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSessionTimezone } from '../../../hooks/useSessionTimezone';
import useApp from '../../../providers/App/useApp';
import { getDashboardFilterBoundaryContexts } from '../../../providers/Dashboard/dashboardFilterBoundaryErrors';

const useFilterBoundaryContext = (
    field?: FilterableItem,
): FilterBoundaryContext => {
    const { projectUuid, startOfWeek, metricQueryTimezone } =
        useFiltersContext();
    const { data: project } = useProject(projectUuid);
    const sessionTimezone = useSessionTimezone();
    const { user } = useApp();
    const getUiString = useUiStrings();
    const { data: timezoneSupport } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    return {
        ...getFilterBoundaryFieldContext(field),
        timezone: resolveQueryTimezone({
            sessionTimezone,
            metricQuery: { timezone: metricQueryTimezone },
            projectTimezone: project?.queryTimezone ?? 'UTC',
            userTimezone: user.data?.timezone ?? null,
        }),
        startOfWeek:
            startOfWeek ??
            getDefaultStartOfWeek(
                project?.warehouseConnection?.type ??
                    SupportedDbtAdapter.POSTGRES,
            ),
        useTimezoneAwareDateTrunc: timezoneSupport?.enabled ?? false,
        getUiString,
    };
};

export const useFilterBoundaryContexts = (
    field?: FilterableItem,
    rule?: DashboardFilterRule,
): FilterBoundaryContext[] => {
    const fallbackContext = useFilterBoundaryContext(field);
    const { filterBoundaryContexts } = useFiltersContext();
    const sessionTimezone = useSessionTimezone();
    const { user } = useApp();
    const contexts = rule
        ? getDashboardFilterBoundaryContexts(rule, {
              filterBoundaryContexts,
              sessionTimezone,
              userTimezone: user.data?.timezone ?? null,
              context: { getUiString: fallbackContext.getUiString },
          })
        : [];
    return contexts.length
        ? contexts
        : [
              {
                  ...fallbackContext,
                  ...(rule?.target.isSqlColumn && {
                      fieldType: rule.target.fallbackType,
                      timezone: 'UTC',
                  }),
              },
          ];
};

export const useIsFilterBoundaryContextLoading = (
    rule?: DashboardFilterRule,
) => {
    const { filterBoundaryContexts, dashboardTiles } = useFiltersContext();
    return !!(
        rule?.boundaries?.type === 'date' &&
        !filterBoundaryContexts &&
        dashboardTiles?.some(
            (tile) =>
                isDashboardChartTileType(tile) || isDashboardSqlChartTile(tile),
        )
    );
};
