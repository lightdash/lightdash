import { type ApiError, type ApiWarehouseCatalog } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type GetTablesParams = {
    projectUuid: string;
};

const fetchTables = async ({ projectUuid }: GetTablesParams) =>
    lightdashApi<ApiWarehouseCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables`,
        method: 'GET',
        body: undefined,
    });

export const useTables = ({ projectUuid }: GetTablesParams) => {
    return useQuery<ApiWarehouseCatalog, ApiError>({
        queryKey: ['sqlRunner', 'tables', projectUuid],
        queryFn: () =>
            fetchTables({
                projectUuid,
            }),
        retry: false,
    });
};
