import {
    ContentType,
    type HomepageCollectionItemRef,
    type ApiContentResponse,
    type ApiError,
    type SummaryContent,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getContentByUuids = async (
    projectUuid: string,
    uuids: string[],
    contentTypes?: ContentType[],
) => {
    const params = new URLSearchParams();
    params.append('projectUuids', projectUuid);
    uuids.forEach((uuid) => params.append('uuids', uuid));
    contentTypes?.forEach((type) => params.append('contentTypes', type));
    params.append('pageSize', String(Math.max(uuids.length, 10)));
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

// Server-side access filtering: inaccessible or deleted refs are simply absent
export const useCollectionContent = (
    projectUuid: string,
    uuids: string[],
    contentTypes?: ContentType[],
) =>
    useQuery<SummaryContent[], ApiError>({
        enabled: uuids.length > 0,
        queryKey: [
            'homepage_collection_content',
            projectUuid,
            ...uuids,
            ...(contentTypes ? [{ contentTypes }] : []),
        ],
        queryFn: async () => {
            const results = await getContentByUuids(
                projectUuid,
                uuids,
                contentTypes,
            );
            const byUuid = new Map(
                results.data.map((content) => [content.uuid, content]),
            );
            return uuids.flatMap((uuid) => byUuid.get(uuid) ?? []);
        },
    });

const DOCUMENT_CONTENT_TYPES = [ContentType.DOCUMENT];

export const useCollectionItems = (
    projectUuid: string,
    refs: HomepageCollectionItemRef[],
) => {
    const content = useCollectionContent(
        projectUuid,
        refs
            .filter((ref) => ref.contentType !== 'document')
            .map((ref) => ref.uuid),
    );
    const documents = useCollectionContent(
        projectUuid,
        refs
            .filter((ref) => ref.contentType === 'document')
            .map((ref) => ref.uuid),
        DOCUMENT_CONTENT_TYPES,
    );
    const byUuid = new Map(
        [...(content.data ?? []), ...(documents.data ?? [])].map((item) => [
            item.uuid,
            item,
        ]),
    );
    return {
        data: refs.flatMap((ref) => byUuid.get(ref.uuid) ?? []),
        isInitialLoading:
            content.isInitialLoading || documents.isInitialLoading,
    };
};
