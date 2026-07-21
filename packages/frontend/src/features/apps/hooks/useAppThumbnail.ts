import {
    type ApiAppThumbnailUrlResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UploadAppThumbnailParams = {
    projectUuid: string;
    appUuid: string;
    file: File;
};

const uploadAppThumbnail = async ({
    projectUuid,
    appUuid,
    file,
}: UploadAppThumbnailParams): Promise<void> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/thumbnail`,
        {
            method: 'POST',
            body: file,
            headers: { 'Content-Type': file.type },
        },
    );

    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(
            errorBody?.error?.message ??
                `Thumbnail upload failed: ${response.status}`,
        );
    }
};

const fetchAppThumbnailUrl = async (
    projectUuid: string,
    appUuid: string,
): Promise<ApiAppThumbnailUrlResponse['results']> =>
    lightdashApi<ApiAppThumbnailUrlResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/thumbnail`,
        body: undefined,
    });

/**
 * Uploads a thumbnail image for an app.
 */
export const useAppThumbnailUpload = () =>
    useMutation<void, Error, UploadAppThumbnailParams>({
        mutationFn: uploadAppThumbnail,
    });

/**
 * Fetches an app's thumbnail URL. `enabled` gates the request so callers can,
 * for example, only fetch while the app is hovered.
 */
export const useAppThumbnailUrl = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    enabled: boolean,
) =>
    useQuery<ApiAppThumbnailUrlResponse['results'], ApiError>({
        queryKey: ['app-thumbnail', projectUuid, appUuid],
        queryFn: () => fetchAppThumbnailUrl(projectUuid!, appUuid!),
        enabled: enabled && !!projectUuid && !!appUuid,
        retry: false,
        refetchOnWindowFocus: false,
    });
