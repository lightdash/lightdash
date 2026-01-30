import { type ApiError, type SpaceDeleteImpact } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

const getSpaceDeleteImpact = async (
    projectUuid: string,
    spaceUuid: string,
): Promise<SpaceDeleteImpact> => {
    const response = await fetch(
        `/api/v1/projects/${projectUuid}/spaces/${spaceUuid}/delete-impact`,
    );
    const data = await response.json();
    if (!response.ok) {
        throw data;
    }
    return data.results;
};

/**
 * Hook to fetch the delete impact for a space.
 * Use `enabled` option for lazy loading (e.g., when delete modal opens).
 */
export const useSpaceDeleteImpact = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
    queryOptions?: Omit<
        UseQueryOptions<SpaceDeleteImpact, ApiError>,
        'queryKey' | 'queryFn'
    >,
) =>
    useQuery<SpaceDeleteImpact, ApiError>({
        queryKey: ['space-delete-impact', projectUuid, spaceUuid],
        queryFn: () => getSpaceDeleteImpact(projectUuid!, spaceUuid!),
        enabled:
            !!projectUuid && !!spaceUuid && (queryOptions?.enabled ?? true),
        ...queryOptions,
    });
