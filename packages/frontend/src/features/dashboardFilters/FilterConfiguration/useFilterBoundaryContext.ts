import {
    resolveQueryTimezone,
    FeatureFlags,
    getDashboardFilterBoundaryContexts,
    getDefaultStartOfWeek,
    SupportedDbtAdapter,
    getFilterBoundaryFieldContext,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardFilterRule,
    type FilterableItem,
    type FilterBoundaryContext,
} from '@lightdash/common';
import useFiltersContext from '../../../components/common/Filters/useFiltersContext';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSessionTimezone } from '../../../hooks/useSessionTimezone';
import useApp from '../../../providers/App/useApp';

export const useFilterBoundaryContexts = (
    field?: FilterableItem,
    rule?: DashboardFilterRule,
): { contexts: FilterBoundaryContext[]; isLoading: boolean } => {
    const {
        projectUuid,
        startOfWeek,
        metricQueryTimezone,
        dashboardTiles,
        filterBoundaryContexts,
    } = useFiltersContext();
    const { data: project } = useProject(projectUuid);
    const sessionTimezone = useSessionTimezone();
    const { user } = useApp();
    const getUiString = useUiStrings();
    const { data: timezoneSupport } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
        { enabled: !!rule?.boundaries },
    );
    const contexts = rule
        ? getDashboardFilterBoundaryContexts(rule, {
              filterBoundaryContexts,
              sessionTimezone,
              userTimezone: user.data?.timezone ?? null,
              context: { getUiString },
          })
        : [];
    return {
        isLoading:
            !!rule?.boundaries &&
            !filterBoundaryContexts &&
            !!dashboardTiles?.some(
                (tile) =>
                    isDashboardChartTileType(tile) ||
                    isDashboardSqlChartTile(tile),
            ),
        contexts: contexts.length
            ? contexts
            : [
                  {
                      ...getFilterBoundaryFieldContext(field),
                      timezone: rule?.target.isSqlColumn
                          ? 'UTC'
                          : resolveQueryTimezone({
                                sessionTimezone,
                                metricQuery: { timezone: metricQueryTimezone },
                                projectTimezone:
                                    project?.queryTimezone ?? 'UTC',
                                userTimezone: user.data?.timezone ?? null,
                            }),
                      ...(rule?.target.isSqlColumn && {
                          fieldType: rule.target.fallbackType,
                      }),
                      startOfWeek:
                          startOfWeek ??
                          project?.warehouseConnection?.startOfWeek ??
                          getDefaultStartOfWeek(
                              project?.warehouseConnection?.type ??
                                  SupportedDbtAdapter.POSTGRES,
                          ),
                      useTimezoneAwareDateTrunc:
                          timezoneSupport?.enabled ?? false,
                      getUiString,
                  },
              ],
    };
};
