import {
    type ApiAppVersionSummary,
    type ApiError,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const isApiError = (error: unknown): error is ApiError =>
    typeof error === 'object' && error !== null && 'error' in error;

// The app read pages versions newest first, so the page ending at `version`
// holds that version first when it exists, and 404s when nothing is that old.
const fetchAppVersion = async (
    projectUuid: string,
    appUuid: string,
    version: number,
): Promise<ApiAppVersionSummary | null> => {
    const params = new URLSearchParams({
        beforeVersion: String(version + 1),
        limit: '1',
    });
    try {
        const app = await lightdashApi<ApiGetAppResponse['results']>({
            method: 'GET',
            url: `/ee/projects/${projectUuid}/apps/${appUuid}?${params.toString()}`,
            body: undefined,
        });
        return app.versions.find((v) => v.version === version) ?? null;
    } catch (error) {
        if (isApiError(error) && error.error.statusCode === 404) return null;
        throw error;
    }
};

/** One version of a data app whatever its status; null when it doesn't exist. */
export const useAppVersion = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
) =>
    useQuery<ApiAppVersionSummary | null, ApiError>({
        queryKey: ['app-version', projectUuid, appUuid, version],
        queryFn: () => fetchAppVersion(projectUuid!, appUuid!, version!),
        enabled: !!projectUuid && !!appUuid && version !== undefined,
    });
