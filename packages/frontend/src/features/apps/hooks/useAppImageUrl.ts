import { type ApiAppImageUrlResponse, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const fetchImageUrl = (
    projectUuid: string,
    appUuid: string,
    imageId: string,
): Promise<ApiAppImageUrlResponse['results']> =>
    lightdashApi<ApiAppImageUrlResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/images/${imageId}`,
        body: undefined,
    });

export const useAppImageUrl = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    imageId: string | undefined,
) =>
    useQuery<ApiAppImageUrlResponse['results'], ApiError>({
        queryKey: ['app-image-url', projectUuid, appUuid, imageId],
        queryFn: () => fetchImageUrl(projectUuid!, appUuid!, imageId!),
        enabled: !!projectUuid && !!appUuid && !!imageId,
        staleTime: 10 * 60 * 1000, // 10 minutes (presigned URL lasts 15 min)
    });
