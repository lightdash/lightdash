import { type ApiVirtualViewAsCodeListResponse } from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { useContentAsCode } from './useContentAsCode';

const selectVirtualView = (
    results: ApiVirtualViewAsCodeListResponse['results'],
) => results.virtualViews[0];

export const useVirtualViewAsCode = ({
    projectUuid,
    virtualViewSlug,
    enabled,
}: {
    projectUuid: string;
    virtualViewSlug: string;
    enabled: boolean;
}) => {
    return useContentAsCode<ApiVirtualViewAsCodeListResponse['results']>({
        queryKey: ['virtual-view-as-code', projectUuid, virtualViewSlug],
        queryFn: () =>
            lightdashApi<ApiVirtualViewAsCodeListResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/virtualViews?${new URLSearchParams(
                    [['slugs', virtualViewSlug]],
                ).toString()}`,
                body: undefined,
            }),
        selectDocument: selectVirtualView,
        enabled,
    });
};
