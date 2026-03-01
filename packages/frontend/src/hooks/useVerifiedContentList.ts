import { type ApiVerifiedContentListResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getVerifiedContent = async (projectUuid: string) =>
    lightdashApi<ApiVerifiedContentListResponse['results']>({
        url: `/projects/${projectUuid}/content-verification`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedContentList = (projectUuid: string) => {
    return useQuery({
        queryKey: ['verified-content', projectUuid],
        queryFn: () => getVerifiedContent(projectUuid),
    });
};
