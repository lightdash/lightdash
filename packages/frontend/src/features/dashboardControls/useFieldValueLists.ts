import {
    FeatureFlags,
    getItemId,
    type DashboardFilterableField,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import {
    getFieldValues,
    getFieldValuesAsync,
} from '../../hooks/useFieldValues';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

// Lookups return plain values, or values with a label
const toValue = (result: unknown): string[] => {
    if (typeof result === 'string') return [result];
    if (
        typeof result === 'object' &&
        result !== null &&
        'value' in result &&
        typeof result.value === 'string'
    ) {
        return [result.value];
    }
    return [];
};

// One value lookup per field. Each list is null until its lookup returns.
export const useFieldValueLists = (
    projectUuid: string | undefined,
    fields: DashboardFilterableField[],
    parameterValues: ParametersValuesMap,
): (string[] | null)[] => {
    const { data: resultsCacheFlag } = useServerFeatureFlag(
        FeatureFlags.ResultsCacheEnabled,
    );
    const fetchValues =
        resultsCacheFlag?.enabled === true
            ? getFieldValuesAsync
            : getFieldValues;
    const results = useQueries({
        queries: fields.map((field) => ({
            queryKey: [
                'dashboard-control-field-values',
                projectUuid,
                field.table,
                getItemId(field),
                parameterValues,
                resultsCacheFlag?.enabled === true,
            ],
            queryFn: () =>
                fetchValues(
                    projectUuid!,
                    field.table,
                    getItemId(field),
                    '',
                    false,
                    undefined,
                    undefined,
                    parameterValues,
                ),
            enabled: !!projectUuid && resultsCacheFlag !== undefined,
            staleTime: 60 * 1000,
        })),
    });
    return results.map((result) =>
        result.data ? result.data.results.flatMap(toValue) : null,
    );
};
