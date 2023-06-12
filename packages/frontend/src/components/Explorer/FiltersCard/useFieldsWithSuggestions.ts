import {
    AdditionalMetric,
    ApiQueryResults,
    convertAdditionalMetric,
    DimensionType,
    Explore,
    fieldId,
    getResultValueArray,
    getVisibleFields,
    isFilterableField,
    Metric,
} from '@lightdash/common';
import { useEffect, useState } from 'react';
import { FieldsWithSuggestions } from '../../common/Filters/FiltersProvider';

interface FieldsWithSuggestionsHookParams {
    data: Explore | undefined;
    queryResults: ApiQueryResults | undefined;
    additionalMetrics: AdditionalMetric[] | undefined;
}

export const useFieldsWithSuggestions = ({
    data,
    queryResults,
    additionalMetrics,
}: FieldsWithSuggestionsHookParams) => {
    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});

    useEffect(() => {
        if (data) {
            setFieldsWithSuggestions((prev) => {
                const visibleFields = getVisibleFields(data);
                const customMetrics = (additionalMetrics || []).reduce<
                    Metric[]
                >((acc, additionalMetric) => {
                    const table = data.tables[additionalMetric.table];
                    if (table) {
                        const metric = convertAdditionalMetric({
                            additionalMetric,
                            table,
                        });
                        return [...acc, metric];
                    }
                    return acc;
                }, []);

                return [...visibleFields, ...customMetrics].reduce(
                    (sum, field) => {
                        if (isFilterableField(field)) {
                            let suggestions: string[] = [];
                            if (field.type === DimensionType.STRING) {
                                const currentSuggestions =
                                    prev[fieldId(field)]?.suggestions || [];
                                const newSuggestions: string[] =
                                    (queryResults &&
                                        getResultValueArray(
                                            queryResults.rows,
                                            true,
                                        ).reduce<string[]>((acc, row) => {
                                            const value = row[fieldId(field)];
                                            if (typeof value === 'string') {
                                                return [...acc, value];
                                            }
                                            return acc;
                                        }, [])) ||
                                    [];
                                suggestions = Array.from(
                                    new Set([
                                        ...currentSuggestions,
                                        ...newSuggestions,
                                    ]),
                                ).sort((a, b) => a.localeCompare(b));
                            }
                            return {
                                ...sum,
                                [fieldId(field)]: {
                                    ...field,
                                    suggestions,
                                },
                            };
                        }
                        return sum;
                    },
                    {},
                );
            });
        }
    }, [data, queryResults, additionalMetrics]);

    return fieldsWithSuggestions;
};
