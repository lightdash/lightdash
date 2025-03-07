import {
    type ApiError,
    type ApiWarehouseCatalog,
    type ApiWarehouseTablesCatalog,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type GetTablesParams = {
    projectUuid: string;
};

const fetchTables = async ({
    projectUuid,
}: Pick<GetTablesParams, 'projectUuid'>) =>
    lightdashApi<ApiWarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables`,
        method: 'GET',
        body: undefined,
    });

const refreshTables = async ({
    projectUuid,
}: Pick<GetTablesParams, 'projectUuid'>) =>
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
    return useQuery<
        ApiWarehouseTablesCatalog,
        ApiError,
        ApiWarehouseTablesCatalog
    >({
        queryKey: ['sqlRunner', 'tables', projectUuid],
        queryFn: () =>
            fetchTables({
                projectUuid,
            }),
        retry: false,
        enabled: !!projectUuid,
        /*select(data) {
        

            if (!search)
                return {
                    database: Object.keys(data)[0],
                    tablesBySchema,
                };

            const searchResults: TablesBySchema = tablesBySchema
                .map((schemaData) => {
                    const { schema, tables } = schemaData;
                    const tableNames = Object.keys(tables);

                    const fuse = new Fuse(tableNames, {
                        threshold: 0.3,
                        isCaseSensitive: false,
                    });

                    const fuseResult = fuse
                        .search(search)
                        .map((res) => res.item);

                    return {
                        schema,
                        tables: fuseResult.reduce<typeof tables>(
                            (acc, tableName) => {
                                acc[tableName] = tables[tableName];
                                return acc;
                            },
                            {},
                        ),
                    };
                })
                .filter(
                    (schemaData) => Object.keys(schemaData.tables).length > 0,
                );

            if (searchResults.length === 0) {
                return undefined;
            } else
                return {
                    database: Object.keys(data)[0],
                    tablesBySchema: searchResults,
                };
        },*/
    });
};

export const useRefreshTables = ({
    projectUuid,
}: Pick<GetTablesParams, 'projectUuid'>) => {
    const queryClient = useQueryClient();

    return useMutation<ApiWarehouseTablesCatalog, ApiError>(
        () => refreshTables({ projectUuid }),
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
