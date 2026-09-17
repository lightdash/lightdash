import {
    type ApiError,
    type DimensionType,
    type WarehouseTableSchema,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import isEmpty from 'lodash/isEmpty';
import { lightdashApi } from '../../../api';

export type TableFieldsTarget = {
    projectUuid: string;
    connectionUuid?: string;
    tableName: string | undefined;
    schema: string | undefined;
    database: string | undefined;
};

export type GetTableFieldsParams = TableFieldsTarget & {
    search: string | undefined;
};

export const tableFieldsQueryKey = ({
    projectUuid,
    connectionUuid,
    tableName,
    schema,
    database,
}: TableFieldsTarget) => [
    'sqlRunner',
    'fields',
    projectUuid,
    connectionUuid,
    database ?? '',
    schema ?? '',
    tableName ?? '',
];

export const fetchTableFields = async ({
    projectUuid,
    connectionUuid,
    tableName,
    schema,
    database,
}: TableFieldsTarget) => {
    const params = {
        ...(tableName ? { tableName } : {}),
        ...(schema ? { schemaName: schema } : {}),
        ...(database ? { databaseName: database } : {}),
        ...(connectionUuid ? { connectionUuid } : {}),
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
    database: string;
};

export const useTableFields = ({
    projectUuid,
    connectionUuid,
    tableName,
    search,
    schema,
    database,
}: GetTableFieldsParams) => {
    return useQuery<
        WarehouseTableSchema,
        ApiError,
        Array<WarehouseTableField> | undefined
    >({
        queryKey: tableFieldsQueryKey({
            projectUuid,
            connectionUuid,
            tableName,
            schema,
            database,
        }),
        queryFn: () =>
            fetchTableFields({
                projectUuid,
                connectionUuid,
                tableName,
                schema,
                database,
            }),
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
