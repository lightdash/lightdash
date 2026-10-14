import { type ApiError, type ReleaseHighlightsResult } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useApp from '../../../providers/App/useApp';

export const useReleaseHighlights = ({ enabled }: { enabled: boolean }) => {
    const { health } = useApp();
    return useQuery<ReleaseHighlightsResult, ApiError>({
        queryKey: [
            'releaseHighlights',
            health.data?.version ?? null,
            health.data?.latest.version ?? null,
        ],
        queryFn: () =>
            lightdashApi<ReleaseHighlightsResult>({
                url: '/ai/release-highlights',
                method: 'GET',
                body: undefined,
            }),
        enabled,
        staleTime: Infinity,
        retry: false,
    });
};
