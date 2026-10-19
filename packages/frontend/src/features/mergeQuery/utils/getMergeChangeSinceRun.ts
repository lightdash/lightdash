import { type MergeQuery } from '@lightdash/common';

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

export const getMergeChangeSinceRun = (
    ran: MergeQuery,
    wanted: MergeQuery,
): MergeChangeSinceRun => {
    if (stable(ran.sources) !== stable(wanted.sources)) return 'sources';
    const joinOf = ({
        joinKey,
        joinType,
        limit,
        tableCalculations,
    }: MergeQuery) => stable({ joinKey, joinType, limit, tableCalculations });
    return joinOf(ran) === joinOf(wanted) ? 'none' : 'join';
};
