import {
    type DashboardAvailableFilters,
    type DashboardFilterBoundarySourceContext,
} from '../types/dashboard';
import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardFilters,
} from '../types/filter';
import {
    getDashboardBoundaryErrors,
    type FilterBoundaryContext,
} from './filterBoundaries';
import { resolveQueryTimezone } from './resolveQueryTimezone';

type BoundaryContextArgs = {
    filterBoundaryContexts: DashboardAvailableFilters['filterBoundaryContexts'];
    sessionTimezone: string | null;
    userTimezone: string | null;
    context?: Pick<FilterBoundaryContext, 'getUiString' | 'now'>;
};

const getSourceBoundaryContext = (
    source: DashboardFilterBoundarySourceContext,
    target: DashboardFieldTarget,
    {
        sessionTimezone,
        userTimezone,
        context,
    }: Omit<BoundaryContextArgs, 'filterBoundaryContexts'>,
): FilterBoundaryContext => ({
    ...context,
    ...(source.isSqlChart
        ? { fieldType: target.fallbackType }
        : source.fields[target.fieldId]),
    startOfWeek: source.startOfWeek,
    useTimezoneAwareDateTrunc: source.useTimezoneAwareDateTrunc,
    timezone: source.isSqlChart
        ? 'UTC'
        : resolveQueryTimezone({
              sessionTimezone: source.isMergeSource ? null : sessionTimezone,
              metricQuery: { timezone: source.timezone },
              projectTimezone: source.projectTimezone,
              userTimezone,
          }),
});

/** Resolve every query source affected by a rule, including mapped merged fields. */
export const getDashboardFilterBoundaryContexts = (
    rule: DashboardFilterRule,
    args: BoundaryContextArgs,
): FilterBoundaryContext[] =>
    Object.entries(args.filterBoundaryContexts ?? {}).flatMap(
        ([tileUuid, sources]) => {
            if (rule.tileTargets?.[tileUuid] === false) return [];
            const target = rule.tileTargets?.[tileUuid] || rule.target;
            return sources.flatMap((source) => {
                const applies = source.isSqlChart
                    ? !!rule.tileTargets?.[tileUuid] && target.isSqlColumn
                    : !!source.fields[target.fieldId];
                return applies
                    ? [getSourceBoundaryContext(source, target, args)]
                    : [];
            });
        },
    );

export const getDashboardChartBoundaryErrors = ({
    savedFilters,
    filters,
    ...args
}: BoundaryContextArgs & {
    savedFilters: DashboardFilters;
    filters: DashboardFilters;
}): string[] =>
    Object.entries(args.filterBoundaryContexts ?? {}).flatMap(
        ([tileUuid, sources]) =>
            sources.flatMap((source) =>
                getDashboardBoundaryErrors(
                    savedFilters,
                    filters,
                    tileUuid,
                    source.isSqlChart
                        ? Object.values(savedFilters)
                              .flat()
                              .flatMap((rule) => {
                                  const target = rule.tileTargets?.[tileUuid];
                                  return target && target.isSqlColumn
                                      ? [target.fieldId]
                                      : [];
                              })
                        : Object.keys(source.fields),
                    (target) => getSourceBoundaryContext(source, target, args),
                ),
            ),
    );
