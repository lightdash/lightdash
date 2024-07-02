import { type ApiError, type ApiWarehouseTableFields } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../../../api';

export type GetTableFieldsParams = {
    projectUuid: string;
    tableName: string | undefined;
    search: string | undefined;
};

const fetchTableFields = async ({
    projectUuid,
    tableName,
}: Pick<GetTableFieldsParams, 'projectUuid' | 'tableName'>) =>
    lightdashApi<ApiWarehouseTableFields>({
        url: `/projects/${projectUuid}/sqlRunner/tables/${tableName}`,
        method: 'GET',
        body: undefined,
    });

export const useTableFields = ({
    projectUuid,
    tableName,
    search,
}: GetTableFieldsParams) => {
    return useQuery<ApiWarehouseTableFields, ApiError, string[] | undefined>({
        queryKey: ['sqlRunner', 'tables', tableName, projectUuid, search],
        queryFn: () =>
            fetchTableFields({
                projectUuid,
                tableName,
            }),
        retry: false,
        enabled: !!tableName,
        select(data) {
            const fieldNames = Object.keys(data);

            if (!search) return fieldNames;

            const fuse = new Fuse(fieldNames, {
                threshold: 0.3,
                isCaseSensitive: false,
            });

            const searchResults = fuse.search(search).map((res) => res.item);

            if (searchResults.length === 0) {
                return undefined;
            }

            return searchResults;
        },
    });
};
