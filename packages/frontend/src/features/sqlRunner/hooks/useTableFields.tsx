import { type ApiError, type ApiWarehouseTableFields } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type GetTableFieldsParams = {
    projectUuid: string;
    tableName: string | undefined;
};

const fetchTableFields = async ({
    projectUuid,
    tableName,
}: GetTableFieldsParams) =>
    lightdashApi<ApiWarehouseTableFields>({
        url: `/projects/${projectUuid}/sqlRunner/tables/${tableName}`,
        method: 'GET',
        body: undefined,
    });

export const useTableFields = ({
    projectUuid,
    tableName,
}: GetTableFieldsParams) => {
    return useQuery<ApiWarehouseTableFields, ApiError>({
        queryKey: ['sqlRunner', 'tables', tableName, projectUuid],
        queryFn: () =>
            fetchTableFields({
                projectUuid,
                tableName,
            }),
        retry: false,
        enabled: !!tableName,
    });
};
