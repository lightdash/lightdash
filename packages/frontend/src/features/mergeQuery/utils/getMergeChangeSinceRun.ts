import { isMergeMetricSource, type MergeQuery } from '@lightdash/common';
import { withoutRulesOn } from './syncMergeJoinFilters';

/**
 * What changed between the merge that ran and the merge that would run now.
 *
 * `join` covers the relationship and the merged result's own inputs: join
 * type, join key, limit and merge calculations. The legs are unchanged, so
 * only the join step has to run again. `sources` means a leg changed too.
 * Sorts are not compared: a sort change is reconciled on its own, from the
 * sort the result reports.
 */
export type MergeChangeSinceRun = 'none' | 'join' | 'sources';

const stable = (value: unknown) => JSON.stringify(value);

/** Sources without their rules on either run's join key fields. */
const sourcesBesideJoinKey = (query: MergeQuery, other: MergeQuery) =>
    query.sources.map((source) =>
        isMergeMetricSource(source)
            ? {
                  ...source,
                  metricQuery: {
                      ...source.metricQuery,
                      filters: withoutRulesOn(
                          source.metricQuery.filters,
                          new Set(
                              [...query.joinKey, ...other.joinKey].flatMap(
                                  (part) => {
                                      const fieldId =
                                          part.fieldIdBySourceId[source.id];
                                      return fieldId ? [fieldId] : [];
                                  },
                              ),
                          ),
                      ),
                  },
              }
            : source,
    );

export const getMergeChangeSinceRun = (
    ran: MergeQuery,
    wanted: MergeQuery,
): MergeChangeSinceRun => {
    const keyChanged = stable(ran.joinKey) !== stable(wanted.joinKey);
    // Shared filters move with the join key; that move is part of the join change
    const sourcesChanged = keyChanged
        ? stable(sourcesBesideJoinKey(ran, wanted)) !==
          stable(sourcesBesideJoinKey(wanted, ran))
        : stable(ran.sources) !== stable(wanted.sources);
    if (sourcesChanged) return 'sources';
    const joinOf = ({
        joinKey,
        joinType,
        limit,
        tableCalculations,
    }: MergeQuery) => stable({ joinKey, joinType, limit, tableCalculations });
    return joinOf(ran) === joinOf(wanted) ? 'none' : 'join';
};
