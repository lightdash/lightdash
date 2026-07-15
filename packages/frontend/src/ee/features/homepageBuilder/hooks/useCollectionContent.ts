import {
    type ApiContentResponse,
    type ApiError,
    type SummaryContent,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getContentByUuids = async (projectUuid: string, uuids: string[]) => {
    const params = new URLSearchParams();
    params.append('projectUuids', projectUuid);
    uuids.forEach((uuid) => params.append('uuids', uuid));
    params.append('pageSize', String(Math.max(uuids.length, 10)));
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

// Server-side access filtering: inaccessible or deleted refs are simply absent
export const useCollectionContent = (projectUuid: string, uuids: string[]) =>
    useQuery<SummaryContent[], ApiError>({
        enabled: uuids.length > 0,
        queryKey: ['homepage_collection_content', projectUuid, ...uuids],
        queryFn: async () => {
            const results = await getContentByUuids(projectUuid, uuids);
            const byUuid = new Map(
                results.data.map((content) => [content.uuid, content]),
            );
            return uuids.flatMap((uuid) => byUuid.get(uuid) ?? []);
        },
    });
