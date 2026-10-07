import {
    type ApiAppThumbnailUrlResponse,
    type ApiError,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
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
