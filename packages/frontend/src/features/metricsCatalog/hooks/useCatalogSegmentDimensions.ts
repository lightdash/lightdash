import { type ApiSegmentDimensionsResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GetSegmentDimensionsArgs = {
    projectUuid: string | undefined;
    tableName: string | undefined;
};

const getSegmentDimensions = async ({
    projectUuid,
    tableName,
}: GetSegmentDimensionsArgs) => {
    return lightdashApi<ApiSegmentDimensionsResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/${tableName}/segment-dimensions`,
        method: 'GET',
        body: undefined,
    });
};

type UseSegmentDimensionsArgs = GetSegmentDimensionsArgs & {
    options?: UseQueryOptions<ApiSegmentDimensionsResponse['results']>;
};

export const useCatalogSegmentDimensions = ({
    projectUuid,
    tableName,
    options,
}: UseSegmentDimensionsArgs) => {
    return useQuery({
        queryKey: [projectUuid, 'catalog', tableName, 'segmentDimensions'],
        queryFn: () => getSegmentDimensions({ projectUuid, tableName }),
        ...options,
    });
};
