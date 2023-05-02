import { ApiError, ApiPinnedItems, PinnedItems } from '@lightdash/common';
import { useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';

const getPinnedItems = async (projectUuid: string, pinnedlistUuid: string) =>
    lightdashApi<PinnedItems>({
        url: `/projects/${projectUuid}/pinned-lists/${pinnedlistUuid}/items`,
        method: 'GET',
        body: undefined,
    });

export const usePinnedItems = (
    projectUuid: string,
    pinnedlistUuid: string | undefined,
) =>
    useQuery<PinnedItems, ApiError>({
        queryKey: ['pinned_items', projectUuid, pinnedlistUuid],
        queryFn: () => getPinnedItems(projectUuid, pinnedlistUuid || ''),
        enabled: !!pinnedlistUuid,
    });
