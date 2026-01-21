import { type ApiFilterDimensionsResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GetFilterDimensionsArgs = {
    projectUuid: string | undefined;
    tableName: string | undefined;
};

const getFilterDimensions = async ({
    projectUuid,
    tableName,
}: GetFilterDimensionsArgs) => {
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
    return useQuery({
        queryKey: [projectUuid, 'catalog', tableName, 'filterDimensions'],
        queryFn: () => getFilterDimensions({ projectUuid, tableName }),
        ...options,
    });
};
