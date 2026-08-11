import type {
    ApiAiProjectContextEntryResponse,
    ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getAiProjectContextEntry = (projectUuid: string, slug: string) =>
    lightdashApi<ApiAiProjectContextEntryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiProjectContextEntries/${slug}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Resolves a project-context citation slug to the entry the agent read,
 * including entries since edited or removed from the context file.
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
        // Unresolvable slugs are terminal, not transient
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 && failureCount < 2,
    });
