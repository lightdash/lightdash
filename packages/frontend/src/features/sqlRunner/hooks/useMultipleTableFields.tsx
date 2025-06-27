import { type ApiError, type WarehouseTableSchema } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
    fetchTableFields,
    type WarehouseTableFieldWithContext,
} from './useTableFields';

export type TableReference = {
    projectUuid: string;
    tableName: string;
    schema: string;
};

export const useMultipleTableFields = (tableReferences: TableReference[]) => {
    // Create queries for each unique table reference
    const queries = useMemo(() => {
        // Deduplicate table references based on projectUuid + schema + tableName
        const uniqueReferences = tableReferences.filter(
            (ref, index, self) =>
                index ===
                self.findIndex(
                    (r) =>
                        r.projectUuid === ref.projectUuid &&
                        r.schema === ref.schema &&
                        r.tableName === ref.tableName,
                ),
        );

        return uniqueReferences.map((ref) => ({
            queryKey: [
                'sqlRunner',
                'tables',
                ref.tableName,
                ref.projectUuid,
                ref.schema,
            ],
            queryFn: () =>
                fetchTableFields({
                    projectUuid: ref.projectUuid,
                    tableName: ref.tableName,
                    schema: ref.schema,
                }),
            retry: false,
            enabled: !!(ref.projectUuid && ref.tableName && ref.schema),
            staleTime: 5 * 60 * 1000, // 5 minutes - keep data fresh but allow caching
            meta: {
                tableName: ref.tableName,
                schema: ref.schema,
                projectUuid: ref.projectUuid,
            },
        }));
    }, [tableReferences]);

    const results = useQueries({
        queries,
    });

    const allFieldsWithContext =
        useMemo((): WarehouseTableFieldWithContext[] => {
            return results
                .filter((result) => result.isSuccess && result.data)
                .flatMap((result, index) => {
                    const data = result.data as WarehouseTableSchema;
                    // Get the corresponding query meta data
                    const queryMeta = queries[index]?.meta;
                    const table = queryMeta?.tableName || '';
                    const schema = queryMeta?.schema || '';

                    return Object.entries(
                        data,
                    ).map<WarehouseTableFieldWithContext>(([name, type]) => ({
                        name,
                        type,
                        table,
                        schema,
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
