import { type ApiError, type LoomThumbnailResult } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getLoomThumbnail = async (url: string): Promise<LoomThumbnailResult> =>
    lightdashApi<LoomThumbnailResult>({
        url: `/loom/thumbnail?url=${encodeURIComponent(url)}`,
        method: 'GET',
        body: undefined,
    });

export const useLoomThumbnail = (loomUrl: string | undefined, enabled = true) =>
    useQuery<LoomThumbnailResult, ApiError>({
        queryKey: ['loom-thumbnail', loomUrl],
        queryFn: () => getLoomThumbnail(loomUrl!),
        enabled: enabled && !!loomUrl,
        staleTime: Infinity,
        retry: 1,
    });
