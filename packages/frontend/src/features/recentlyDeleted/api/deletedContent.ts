import {
    type ContentType,
    type DeletedContentItem,
    type DeletedContentSummary,
    type KnexPaginatedData,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

export type DeletedContentApiParams = {
    projectUuids: string[];
    page?: number;
    pageSize?: number;
    search?: string;
    contentTypes?: ContentType[];
    deletedByUserUuids?: string[];
};

type DeletedContentApiResponse = KnexPaginatedData<DeletedContentSummary[]>;

export async function getDeletedContent(
    params: DeletedContentApiParams,
): Promise<DeletedContentApiResponse> {
    const searchParams = new URLSearchParams();

    params.projectUuids.forEach((uuid) =>
        searchParams.append('projectUuids', uuid),
    );

    if (params.page) {
        searchParams.set('page', String(params.page));
    }

    if (params.pageSize) {
        searchParams.set('pageSize', String(params.pageSize));
    }

    if (params.search) {
        searchParams.set('search', params.search);
    }

    if (params.contentTypes && params.contentTypes.length > 0) {
        params.contentTypes.forEach((type) =>
            searchParams.append('contentTypes', type),
        );
    }

    if (params.deletedByUserUuids && params.deletedByUserUuids.length > 0) {
        params.deletedByUserUuids.forEach((uuid) =>
            searchParams.append('deletedByUserUuids', uuid),
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return lightdashApi<any>({
        url: `/content/deleted?${searchParams.toString()}`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
}

export function restoreDeletedContent(
    projectUuid: string,
    item: DeletedContentItem,
): Promise<undefined> {
    return lightdashApi<undefined>({
        url: `/content/${projectUuid}/restore`,
        method: 'POST',
        body: JSON.stringify({ item }),
        version: 'v2',
    });
}

export function permanentlyDeleteContent(
    projectUuid: string,
    item: DeletedContentItem,
): Promise<undefined> {
    return lightdashApi<undefined>({
        url: `/content/${projectUuid}/permanent`,
        method: 'DELETE',
        body: JSON.stringify({ item }),
        version: 'v2',
    });
}
