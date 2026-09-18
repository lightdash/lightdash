import { type ApiError } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import isEmpty from 'lodash/isEmpty';
import { useMemo } from 'react';
import {
    fetchTableFields,
    tableFieldsQueryKey,
    type WarehouseTableFieldWithContext,
} from './useTableFields';

export type TableReference = {
    projectUuid: string;
    connectionUuid?: string;
    tableName: string;
    schema: string;
    database: string;
};

export const useMultipleTableFields = (
    tableReferences: TableReference[],
    isConnectionSettled: boolean = true,
) => {
    // Create queries for each unique table reference
    const queries = useMemo(() => {
        // Deduplicate table references based on projectUuid + connectionUuid + database + schema + tableName
        const uniqueReferences = tableReferences.filter(
            (ref, index, self) =>
                index ===
                self.findIndex(
                    (r) =>
                        r.projectUuid === ref.projectUuid &&
                        r.connectionUuid === ref.connectionUuid &&
                        r.database === ref.database &&
                        r.schema === ref.schema &&
                        r.tableName === ref.tableName,
                ),
        );

        return uniqueReferences.map((ref) => ({
            queryKey: tableFieldsQueryKey(ref),
            queryFn: () =>
                fetchTableFields({
                    projectUuid: ref.projectUuid,
                    connectionUuid: ref.connectionUuid,
                    tableName: ref.tableName,
                    schema: ref.schema,
                    database: ref.database,
                }),
            retry: false,
            enabled:
                isConnectionSettled &&
                !!(ref.projectUuid && ref.tableName && ref.schema),
            staleTime: 5 * 60 * 1000, // 5 minutes - keep data fresh but allow caching
            meta: {
                tableName: ref.tableName,
                schema: ref.schema,
                database: ref.database,
                projectUuid: ref.projectUuid,
                connectionUuid: ref.connectionUuid,
            },
        }));
    }, [tableReferences, isConnectionSettled]);

    const results = useQueries({
        queries,
    });

    const allFieldsWithContext =
        useMemo((): WarehouseTableFieldWithContext[] => {
            return results
                .filter((result) => result.isSuccess && result.data)
                .flatMap((result, index) => {
                    const data = result.data;
                    if (!data || isEmpty(data)) return [];

                    // Get the corresponding query meta data
                    const queryMeta = queries[index]?.meta;
                    const table = queryMeta?.tableName || '';
                    const schema = queryMeta?.schema || '';
                    const database = queryMeta?.database || '';

                    return Object.entries(
                        data,
                    ).map<WarehouseTableFieldWithContext>(([name, type]) => ({
                        name,
                        type,
                        table,
                        schema,
                        database,
                    }));
                });
        }, [results, queries]);

    // Aggregate loading and error states
    const isLoading = results.some((result) => result.isLoading);
    const isError = results.some((result) => result.isError);
    const errors = results
        .filter((result) => result.isError)
        .map((result) => result.error as ApiError);

    return {
        data: allFieldsWithContext,
        isLoading,
        isError,
        errors,
    };
};
