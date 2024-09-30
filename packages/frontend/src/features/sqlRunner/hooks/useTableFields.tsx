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
    schema: string | undefined;
    search: string | undefined;
};

const fetchTableFields = async ({
    projectUuid,
    tableName,
    schema,
}: Pick<GetTableFieldsParams, 'projectUuid' | 'tableName' | 'schema'>) => {
    const params = {
        ...(tableName ? { tableName } : {}),
        ...(schema ? { schemaName: schema } : {}),
    };
    const query = new URLSearchParams(params).toString();
    return lightdashApi<WarehouseTableSchema>({
        url: `/projects/${projectUuid}/sqlRunner/fields?${query}`,
        method: 'GET',
        body: undefined,
    });
};

export type WarehouseTableField = {
    name: string;
    type: DimensionType;
};

export const useTableFields = ({
    projectUuid,
    tableName,
    search,
    schema,
}: GetTableFieldsParams) => {
    return useQuery<
        WarehouseTableSchema,
        ApiError,
        Array<WarehouseTableField> | undefined
    >({
        queryKey: ['sqlRunner', 'tables', tableName, projectUuid, schema],
        queryFn: () =>
            fetchTableFields({
                projectUuid,
                tableName,
                schema,
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
