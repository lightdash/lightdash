import { type ApiError, type ApiWarehouseCatalog } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../../../api';

export type GetTablesParams = {
    projectUuid: string;
    search: string | undefined;
};

const fetchTables = async ({
    projectUuid,
}: Pick<GetTablesParams, 'projectUuid'>) =>
    lightdashApi<ApiWarehouseCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables`,
        method: 'GET',
        body: undefined,
    });

type TablesBySchema =
    | {
          schema: keyof ApiWarehouseCatalog['results'][0];
          tables: ApiWarehouseCatalog['results'][0]['tables'];
      }[]
    | undefined;

export const useTables = ({ projectUuid, search }: GetTablesParams) => {
    return useQuery<
        ApiWarehouseCatalog,
        ApiError,
        { database: string; tablesBySchema: TablesBySchema } | undefined
    >({
        queryKey: ['sqlRunner', 'tables', projectUuid],
        queryFn: () =>
            fetchTables({
                projectUuid,
            }),
        retry: false,
        select(data) {
            const tablesBySchema = Object.entries(data).flatMap(([, schemas]) =>
                Object.entries(schemas).map(([schema, tables]) => ({
                    schema,
                    tables,
                })),
            );

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
        },
    });
};
