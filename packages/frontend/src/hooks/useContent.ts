import {
    type ApiContentResponse,
    type ApiError,
    type ContentType,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

type ContentArgs = {
    projectUuid: string;
    spaceUuids?: string[];
    contentTypes?: ContentType[];
    pageSize?: number;
    page?: number;
};

function createQueryString(params: Record<string, any>): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((v) => query.append(key, v));
        } else if (value !== undefined) {
            query.append(key, value.toString());
        }
    }
    return query.toString();
}
const getContent = async (args: ContentArgs) => {
    const params = createQueryString(args);
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useContent = (args: ContentArgs) => {
    return useQuery<ApiContentResponse['results'], ApiError>({
        queryKey: ['content', JSON.stringify(args)],
        queryFn: () => getContent(args),
    });
};
