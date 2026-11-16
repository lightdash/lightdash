import {
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
    type MetricSourcedMergeQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import {
    compileMergeQuery,
    type CompiledMergeQuery,
} from '../../../../features/mergeQuery/hooks/useMergeQuery';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

/** Compiles a merge for display; idle while there is no merge. */
export const useCompiledMergeQuery = (
    projectUuid: string | undefined,
    mergeQuery: MetricSourcedMergeQuery | null,
    parameters: ParametersValuesMap | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<CompiledMergeQuery, ApiError>({
        queryKey: ['aiMergeCompiledSql', projectUuid, mergeQuery, parameters],
        enabled: !!projectUuid && !!mergeQuery,
        queryFn: () =>
            compileMergeQuery(
                lightdashApi,
                projectUuid!,
                mergeQuery!,
                parameters,
            ),
    });
};

/**
 * The merged statement for a merge artifact's View SQL action, compiled from
 * the MergeQuery the viz query executed — the SQL shown is the SQL that ran.
 */
export const useAiMergeCompiledSql = (
    projectUuid: string | undefined,
    vizQueryData: ApiAiAgentThreadMessageVizQuery | undefined,
) =>
    useCompiledMergeQuery(
        projectUuid,
        vizQueryData?.mergeQuery ?? null,
        vizQueryData?.query.usedParametersValues,
    );
