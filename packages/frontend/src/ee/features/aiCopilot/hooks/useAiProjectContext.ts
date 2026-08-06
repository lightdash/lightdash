import type {
    ApiAiProjectContextEntryResponse,
    ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getAiProjectContextEntry = (projectUuid: string, entryId: string) =>
    lightdashApi<ApiAiProjectContextEntryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiProjectContext/entries/${encodeURIComponent(
            entryId,
        )}`,
        method: 'GET',
        body: undefined,
    });

/** Resolves a `<ld-ctx-cite>` marker back to the entry the agent read. */
export const useAiProjectContextEntry = ({
    projectUuid,
    entryId,
    enabled = true,
}: {
    projectUuid: string | undefined;
    entryId: string | undefined;
    enabled?: boolean;
}) =>
    useQuery<ApiAiProjectContextEntryResponse['results'], ApiError>({
        queryKey: ['aiProjectContextEntry', projectUuid, entryId],
        queryFn: () => getAiProjectContextEntry(projectUuid!, entryId!),
        enabled: enabled && Boolean(projectUuid && entryId),
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 && failureCount < 2,
    });
