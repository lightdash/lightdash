import {
    type ApiError,
    type DimensionType,
    type WarehouseTableSchema,
} from '@lightdash/common';
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
    lightdashApi<WarehouseTableSchema>({
        url: `/projects/${projectUuid}/sqlRunner/tables/${tableName}`,
        method: 'GET',
        body: undefined,
    });

export type WarehouseTableField = {
    name: string;
    type: DimensionType;
};

export const useTableFields = ({
    projectUuid,
    tableName,
    search,
}: GetTableFieldsParams) => {
    return useQuery<
        WarehouseTableSchema,
        ApiError,
        Array<WarehouseTableField> | undefined
    >({
        queryKey: ['sqlRunner', 'tables', tableName, projectUuid],
        queryFn: () =>
            fetchTableFields({
                projectUuid,
                tableName,
            }),
        retry: false,
        enabled: !!tableName,
        select(data) {
            const fields = Object.entries(data).map<WarehouseTableField>(
                ([name, type]) => ({ name, type }),
            );

            if (!search) return fields;

            const fuse = new Fuse(fields, {
                threshold: 0.3,
                isCaseSensitive: false,
                keys: ['name'],
            });

            const searchResults = fuse.search(search).map((res) => res.item);

            if (searchResults.length === 0) {
                return undefined;
            }

            return searchResults;
        },
    });
};
