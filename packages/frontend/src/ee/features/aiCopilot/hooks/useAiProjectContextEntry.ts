import type {
    ApiAiProjectContextEntryResponse,
    ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getAiProjectContextEntry = (projectUuid: string, slug: string) =>
    lightdashApi<ApiAiProjectContextEntryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiProjectContext/entries/${slug}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Resolve a project-context citation. Project-scoped, not agent-scoped: the
 * entry is shared knowledge and is readable with the memory setting off.
 */
export const useAiProjectContextEntry = ({
    projectUuid,
    slug,
    enabled = true,
}: {
    projectUuid: string | undefined;
    slug: string | undefined;
    enabled?: boolean;
}) =>
    useQuery<ApiAiProjectContextEntryResponse['results'], ApiError>({
        queryKey: ['aiProjectContextEntry', projectUuid, slug],
        queryFn: () => getAiProjectContextEntry(projectUuid!, slug!),
        enabled: enabled && Boolean(projectUuid && slug),
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 &&
            error.error?.statusCode !== 403 &&
            failureCount < 2,
    });
