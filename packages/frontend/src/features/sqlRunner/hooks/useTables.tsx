import {
    type ApiError,
    type ApiWarehouseCatalog,
    type ApiWarehouseTablesCatalog,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useWarehouseCatalogueRecovery } from '../../../hooks/sharedSignInQueryRecovery';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export type GetTablesParams = {
    projectUuid: string;
};

const fetchTables = async (
    lightdashApi: LightdashApi,
    { projectUuid }: Pick<GetTablesParams, 'projectUuid'>,
) =>
    lightdashApi<ApiWarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables`,
        method: 'GET',
        body: undefined,
    });

const refreshTables = async (
    lightdashApi: LightdashApi,
    { projectUuid }: Pick<GetTablesParams, 'projectUuid'>,
) =>
    lightdashApi<ApiWarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/refresh-catalog`,
        method: 'POST',
        body: undefined,
    });

export type TablesBySchema =
    | {
          schema: keyof ApiWarehouseCatalog['results'][0];
          tables: ApiWarehouseTablesCatalog['results'][0]['tables'];
      }[]
    | undefined;

export const useTables = ({ projectUuid }: GetTablesParams) => {
    const lightdashApi = useLightdashApi();
    const { canFetch, run } = useWarehouseCatalogueRecovery();
    const queryKey = ['sqlRunner', 'tables', projectUuid];
    return useQuery<
        ApiWarehouseTablesCatalog,
        ApiError,
        ApiWarehouseTablesCatalog
    >({
        queryKey,
        queryFn: () =>
            run(queryKey, projectUuid, null, () =>
                fetchTables(lightdashApi, {
                    projectUuid,
                }),
            ),
        retry: false,
        enabled: !!projectUuid && canFetch(queryKey, projectUuid, null),
    });
};

export const useRefreshTables = ({
    projectUuid,
}: Pick<GetTablesParams, 'projectUuid'>) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<ApiWarehouseTablesCatalog, ApiError>(
        () => refreshTables(lightdashApi, { projectUuid }),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'sqlRunner',
                    'tables',
                    projectUuid,
                ]);
            },
        },
    );
};
