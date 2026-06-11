import { type ApiAppImageUrlResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';

const fetchImageUrl = async (
    projectUuid: string,
    appUuid: string,
    imageId: string,
): Promise<ApiAppImageUrlResponse['results']> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/images/${imageId}`,
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch image URL: ${response.status}`);
    }
    const json = await response.json();
    return json.results;
};

export const useAppImageUrl = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    imageId: string | undefined,
) =>
    useQuery({
        queryKey: ['app-image-url', projectUuid, appUuid, imageId],
        queryFn: () => fetchImageUrl(projectUuid!, appUuid!, imageId!),
        enabled: !!projectUuid && !!appUuid && !!imageId,
        staleTime: 10 * 60 * 1000, // 10 minutes (presigned URL lasts 15 min)
    });
