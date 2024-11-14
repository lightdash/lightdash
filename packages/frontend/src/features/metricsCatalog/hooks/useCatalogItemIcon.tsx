import {
    type ApiError,
    type ApiMetricsCatalog,
    type ApiSuccessEmpty,
    type CatalogItemIcon,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type InfiniteData,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { updateMetricsCatalogQuery } from '../utils/updateMetricsCatalogQuery';

type UpdateCatalogItemIconParams = {
    projectUuid: string;
    catalogSearchUuid: string;
    icon: CatalogItemIcon | null;
};

const updateCatalogItemIcon = async ({
    projectUuid,
    catalogSearchUuid,
    icon,
}: UpdateCatalogItemIconParams) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/dataCatalog/${catalogSearchUuid}/icon`,
        method: 'PATCH',
        body: JSON.stringify({ icon }),
    });
};

/**
 * Update a catalog item's icon
 */
export const useUpdateCatalogItemIcon = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        UpdateCatalogItemIconParams,
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['update-catalog-item-icon'],
        mutationFn: updateCatalogItemIcon,
        onMutate: async ({ catalogSearchUuid, icon, projectUuid }) => {
            await queryClient.cancelQueries({
                queryKey: ['metrics-catalog', projectUuid],
            });

            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            queryClient.setQueriesData<
                InfiniteData<ApiMetricsCatalog['results']>
            >(
                {
                    queryKey: ['metrics-catalog', projectUuid],
                    exact: false,
                },
                (old) =>
                    updateMetricsCatalogQuery(
                        old,
                        (item) => {
                            item.icon = icon;
                        },
                        catalogSearchUuid,
                    ),
            );

            return { previousCatalog };
        },
        onError: (_, __, context) => {
            if (context?.previousCatalog) {
                Object.entries(context.previousCatalog).forEach(
                    ([queryKeyStr, data]) => {
                        const queryKey = JSON.parse(queryKeyStr);
                        queryClient.setQueryData<
                            InfiniteData<ApiMetricsCatalog['results']>
                        >(queryKey, data);
                    },
                );
            }
        },
        onSettled: (_, __, { projectUuid }) => {
            void queryClient.invalidateQueries([
                'metrics-catalog',
                projectUuid,
            ]);
        },
    });
};
