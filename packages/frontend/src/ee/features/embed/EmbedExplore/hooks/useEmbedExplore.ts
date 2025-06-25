import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
// import { useExplore } from '../../../../../hooks/useExplore';

const getEmbedExplore = async (
    projectUuid: string,
    embedToken: string,
    exploreId: string,
) =>
    lightdashApi<ApiExploreResults>({
        url: `/projects/${projectUuid}/explores/${exploreId}`,
        method: 'GET',
        body: undefined,
        headers: {
            Authorization: `Bearer ${embedToken}`,
        },
    });

export const useEmbedExplore = (
    projectUuid: string | undefined,
    embedToken: string | undefined,
    exploreId: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
) => {
    const queryKey = ['embed-explore', projectUuid, embedToken, exploreId];

    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getEmbedExplore(projectUuid!, embedToken!, exploreId!),
        enabled: !!projectUuid && !!embedToken && !!exploreId,
        retry: false,
        ...useQueryOptions,
    });
};

// Alternative hook that uses the modified useExplore hook
// export const useEmbedExploreWithProjectUuid = (
//     activeTableName: string | undefined,
//     projectUuid: string | undefined,
//     useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
// ) => {
//     return useExplore(activeTableName, useQueryOptions, projectUuid);
// };
