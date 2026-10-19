import { type ApiSegmentDimensionsResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type GetSegmentDimensionsArgs = {
    projectUuid: string | undefined;
    tableName: string | undefined;
};

const getSegmentDimensions = async (
    lightdashApi: LightdashApi,
    { projectUuid, tableName }: GetSegmentDimensionsArgs,
) => {
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
    const lightdashApi = useLightdashApi();
    return useQuery({
        queryKey: [projectUuid, 'catalog', tableName, 'segmentDimensions'],
        queryFn: () =>
            getSegmentDimensions(lightdashApi, { projectUuid, tableName }),
        ...options,
    });
};
