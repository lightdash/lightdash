import { FeatureFlags, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import {
    selectParameters,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useMergeSafe } from '../context/useMerge';
import { compileMergeQuery, type CompiledMergeQuery } from './useMergeQuery';
import { useMergeSetup } from './useMergeSetup';

/**
 * The merged statement, compiled for the SQL card.
 *
 * With a merge configured, the merged statement is what Run executes — a SQL
 * card showing Query A's SQL alone would be showing SQL that does not run.
 * `isMergeActive` is false until the merge is complete enough to compile, so
 * callers fall back to the single-query SQL while the join is being set up.
 */
export const useMergeCompiledSql = () => {
    const projectUuid = useProjectUuid();
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const merge = useMergeSafe();
    const { mergeQuery, canRun } = useMergeSetup();
    const parameters = useExplorerSelector(selectParameters);

    const isMergeActive =
        mergeFlag?.enabled === true &&
        !!merge?.isMerging &&
        !!mergeQuery &&
        canRun;

    const query = useQuery<CompiledMergeQuery, ApiError>({
        queryKey: ['mergeCompiledQuery', projectUuid, mergeQuery, parameters],
        queryFn: () => compileMergeQuery(projectUuid!, mergeQuery!, parameters),
        enabled: isMergeActive && !!projectUuid,
        keepPreviousData: true,
    });

    return { isMergeActive, ...query };
};
