import { type HomepageLinkMetadata } from '@lightdash/common';
import { type LightdashApi } from '../../../../api';

/**
 * Unfurl a pasted resource URL via the homepage builder endpoint. Resolves with
 * the detected kind + title/description/imageUrl for allowlisted hosts (Claude /
 * YouTube); rejects for any other host so the caller can fall back to a plain
 * link.
 */
export const fetchHomepageLinkMetadata = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    url: string,
): Promise<HomepageLinkMetadata> => {
    const query = new URLSearchParams({ url });
    return lightdashApi<HomepageLinkMetadata>({
        url: `/projects/${projectUuid}/homepage/link-metadata?${query.toString()}`,
        method: 'GET',
        body: undefined,
    });
};
