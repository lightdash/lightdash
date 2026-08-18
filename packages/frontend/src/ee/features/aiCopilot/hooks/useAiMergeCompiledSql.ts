import {
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import {
    compileMergeQuery,
    type CompiledMergeQuery,
} from '../../../../features/mergeQuery/hooks/useMergeQuery';

/**
 * The merged statement for a merge artifact's View SQL action, compiled from
 * the MergeQuery the viz query executed — the SQL shown is the SQL that ran.
 */
export const useAiMergeCompiledSql = (
    projectUuid: string | undefined,
    vizQueryData: ApiAiAgentThreadMessageVizQuery | undefined,
) => {
    const mergeQuery = vizQueryData?.mergeQuery ?? null;
    return useQuery<CompiledMergeQuery, ApiError>({
        queryKey: ['aiMergeCompiledSql', projectUuid, mergeQuery],
        enabled: !!projectUuid && !!mergeQuery,
        queryFn: () =>
            compileMergeQuery(
                projectUuid!,
                mergeQuery!,
                vizQueryData?.query.usedParametersValues,
            ),
    });
};
