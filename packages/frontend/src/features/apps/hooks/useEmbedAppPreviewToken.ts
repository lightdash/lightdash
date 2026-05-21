import { type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type EmbedAppPreviewToken = {
    token: string;
    version: number;
};

const fetchEmbedAppPreviewToken = async (
    projectUuid: string,
    appUuid: string,
): Promise<EmbedAppPreviewToken> => {
    return lightdashApi<EmbedAppPreviewToken>({
        method: 'GET',
        url: `/embed/${projectUuid}/apps/${appUuid}/preview-token`,
    });
};

/**
 * Embed-side variant of `useAppPreviewToken`. Resolves the latest ready
 * version of the data app *and* mints a token in a single round-trip — the
 * embed dashboard API doesn't bake version metadata into the tile, and
 * `useGetApp` is session-only.
 *
 * `lightdashApi` automatically attaches the embed JWT header when called
 * from inside an `EmbedProvider`.
 */
export const useEmbedAppPreviewToken = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) =>
    useQuery<EmbedAppPreviewToken, ApiError>({
        queryKey: ['embed-app-preview-token', projectUuid, appUuid],
        queryFn: () => fetchEmbedAppPreviewToken(projectUuid!, appUuid!),
        enabled: !!projectUuid && !!appUuid,
    });
