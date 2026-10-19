import { type ApiFilterDimensionsResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type GetFilterDimensionsArgs = {
    projectUuid: string | undefined;
    tableName: string | undefined;
};

const getFilterDimensions = async (
    lightdashApi: LightdashApi,
    { projectUuid, tableName }: GetFilterDimensionsArgs,
) => {
    return lightdashApi<ApiFilterDimensionsResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/${tableName}/filter-dimensions`,
        method: 'GET',
        body: undefined,
    });
};

type UseFilterDimensionsArgs = GetFilterDimensionsArgs & {
    options?: UseQueryOptions<ApiFilterDimensionsResponse['results']>;
};

export const useCatalogFilterDimensions = ({
    projectUuid,
    tableName,
    options,
}: UseFilterDimensionsArgs) => {
    const lightdashApi = useLightdashApi();
    return useQuery({
        queryKey: [projectUuid, 'catalog', tableName, 'filterDimensions'],
        queryFn: () =>
            getFilterDimensions(lightdashApi, { projectUuid, tableName }),
        ...options,
    });
};
