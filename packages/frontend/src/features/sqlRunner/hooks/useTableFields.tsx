import {
    type ApiError,
    type DimensionType,
    type WarehouseTableSchema,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import isEmpty from 'lodash/isEmpty';
import { type LightdashApi } from '../../../api';
import { runWarehouseCatalogueQuery } from '../../../hooks/sharedSignInQueryRecovery';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export type GetTableFieldsParams = {
    projectUuid: string;
    tableName: string | undefined;
    schema: string | undefined;
    search: string | undefined;
};

export const fetchTableFields = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        tableName,
        schema,
    }: Pick<GetTableFieldsParams, 'projectUuid' | 'tableName' | 'schema'>,
) => {
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

export type WarehouseTableFieldWithContext = WarehouseTableField & {
    table: string;
    schema: string;
};

export const useTableFields = ({
    projectUuid,
    tableName,
    search,
    schema,
}: GetTableFieldsParams) => {
    const lightdashApi = useLightdashApi();
    const client = useQueryClient();
    const queryKey = ['sqlRunner', 'tables', tableName, projectUuid, schema];
    return useQuery<
        WarehouseTableSchema,
        ApiError,
        Array<WarehouseTableField> | undefined
    >({
        queryKey,
        queryFn: () =>
            runWarehouseCatalogueQuery(
                client,
                queryKey,
                projectUuid,
                null,
                () =>
                    fetchTableFields(lightdashApi, {
                        projectUuid,
                        tableName,
                        schema,
                    }),
            ),
        retry: false,
        enabled: !!tableName,
        select(data) {
            if (!data || isEmpty(data)) return;

            const fields = Object.entries(data)
                .map<WarehouseTableField>(([name, type]) => ({ name, type }))
                .filter((field) => field.name && field.name.trim() !== '');

            if (!search) return fields;

            const fuse = new Fuse(fields, {
                threshold: 0.3,
                isCaseSensitive: false,
                ignoreLocation: true,
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
