import {
    type ApiAppThumbnailUrlResponse,
    type ApiError,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type AppThumbnailTarget = {
    projectUuid: string;
    appUuid: string;
    /** The version the thumbnail belongs to; null = the latest ready version. */
    version: number | null;
};

type UploadAppThumbnailParams = AppThumbnailTarget & {
    file: File;
};

const versionQuery = (version: number | null) =>
    version === null ? '' : `?version=${version}`;

const uploadAppThumbnail = async ({
    projectUuid,
    appUuid,
    version,
    file,
}: UploadAppThumbnailParams): Promise<void> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/thumbnail${versionQuery(version)}`,
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

const fetchAppVersionThumbnailUrl = async (
    projectUuid: string,
    appUuid: string,
    version: number,
): Promise<ApiAppThumbnailUrlResponse['results']> =>
    lightdashApi<ApiAppThumbnailUrlResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/thumbnail`,
        body: undefined,
    });

const deleteAppThumbnail = async ({
    projectUuid,
    appUuid,
    version,
}: AppThumbnailTarget): Promise<ApiSuccessEmpty['results']> =>
    lightdashApi<ApiSuccessEmpty['results']>({
        method: 'DELETE',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/thumbnail${versionQuery(version)}`,
        body: undefined,
    });

/**
 * Uploads a thumbnail image for one version of an app.
 */
export const useAppThumbnailUpload = () =>
    useMutation<void, Error, UploadAppThumbnailParams>({
        mutationFn: uploadAppThumbnail,
    });

/**
 * Removes the thumbnail of one version of an app. Idempotent on the backend.
 */
export const useAppThumbnailDelete = () =>
    useMutation<ApiSuccessEmpty['results'], ApiError, AppThumbnailTarget>({
        mutationFn: deleteAppThumbnail,
    });

/**
 * Fetches an app's thumbnail URL: its latest ready version's. `enabled` gates the request so callers can,
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

// Signed URLs last 15 minutes.
const VERSION_THUMBNAIL_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Fetches the thumbnail URL of one version of an app. Errors when the version
 * has none. The key extends the app thumbnail key, so refreshing an app's
 * thumbnail also refreshes its versions'.
 */
export const useAppVersionThumbnailUrl = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | null,
    enabled: boolean,
) =>
    useQuery<ApiAppThumbnailUrlResponse['results'], ApiError>({
        queryKey: ['app-thumbnail', projectUuid, appUuid, version],
        queryFn: () =>
            fetchAppVersionThumbnailUrl(projectUuid!, appUuid!, version!),
        enabled: enabled && !!projectUuid && !!appUuid && version !== null,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: VERSION_THUMBNAIL_STALE_TIME_MS,
    });

/**
 * Refreshes everything that shows an app's thumbnails after one was captured
 * or removed, including which versions report having one.
 */
export const refreshAppThumbnailQueries = (
    queryClient: QueryClient,
    {
        projectUuid,
        appUuid,
        change,
    }: {
        projectUuid: string;
        appUuid: string;
        change: 'captured' | 'removed';
    },
) => {
    const thumbnailKey = { queryKey: ['app-thumbnail', projectUuid, appUuid] };
    return Promise.all([
        // A removed thumbnail refetches as a 404, and an invalidated query
        // would keep the stale signed URL as data.
        change === 'removed'
            ? queryClient.resetQueries(thumbnailKey)
            : queryClient.invalidateQueries(thumbnailKey),
        queryClient.invalidateQueries({
            queryKey: ['app', projectUuid, appUuid],
        }),
    ]);
};
