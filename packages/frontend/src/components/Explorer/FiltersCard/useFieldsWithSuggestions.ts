import {
    convertAdditionalMetric,
    DimensionType,
    getItemId,
    getResultValueArray,
    getVisibleFields,
    isCustomSqlDimension,
    isFilterableField,
    type AdditionalMetric,
    type ApiQueryResults,
    type CustomDimension,
    type Explore,
    type FilterableField,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useState } from 'react';

interface FieldsWithSuggestionsHookParams {
    exploreData: Explore | undefined;
    queryResults: ApiQueryResults | undefined;
    customDimensions: CustomDimension[] | undefined;
    additionalMetrics: AdditionalMetric[] | undefined;
    tableCalculations: TableCalculation[] | undefined;
}

export type FieldWithSuggestions = FilterableField & {
    suggestions?: string[];
};

export type FieldsWithSuggestions = Record<string, FieldWithSuggestions>;

export const useFieldsWithSuggestions = ({
    exploreData,
    queryResults,
    customDimensions,
    additionalMetrics,
    tableCalculations,
}: FieldsWithSuggestionsHookParams) => {
    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});

    useEffect(() => {
        if (exploreData) {
            setFieldsWithSuggestions((prev) => {
                const visibleFields = getVisibleFields(exploreData);
                const customMetrics = (additionalMetrics || []).reduce<
                    Metric[]
                >((acc, additionalMetric) => {
                    const table = exploreData.tables[additionalMetric.table];
                    if (table) {
                        const metric = convertAdditionalMetric({
                            additionalMetric,
                            table,
                        });
                        return [...acc, metric];
                    }
                    return acc;
                }, []);

                return [
                    ...visibleFields,
                    ...(customDimensions || []),
                    ...customMetrics,
                    ...(tableCalculations || []),
                ].reduce((sum, field) => {
                    if (isFilterableField(field)) {
                        let suggestions: string[] = [];
                        const type = isCustomSqlDimension(field)
                            ? field.dimensionType
                            : field.type;
                        if (type === DimensionType.STRING) {
                            const currentSuggestions =
                                prev[getItemId(field)]?.suggestions || [];
                            const newSuggestions: string[] =
                                (queryResults &&
                                    getResultValueArray(
                                        queryResults.rows,
                                        true,
                                    ).results.reduce<string[]>((acc, row) => {
                                        const value = row[getItemId(field)];
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
                            [getItemId(field)]: {
                                ...field,
                                suggestions,
                            },
                        };
                    }
                    return sum;
                }, {});
            });
        }
    }, [
        exploreData,
        queryResults,
        additionalMetrics,
        tableCalculations,
        customDimensions,
    ]);

    return fieldsWithSuggestions;
};
