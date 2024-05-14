import {
    convertAdditionalMetric,
    DimensionType,
    fieldId,
    getResultValueArray,
    getVisibleFields,
    isFilterableField,
    TableCalculationType,
    type AdditionalMetric,
    type ApiQueryResults,
    type Explore,
    type FilterableField,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useState } from 'react';

interface FieldsWithSuggestionsHookParams {
    exploreData: Explore | undefined;
    queryResults: ApiQueryResults | undefined;
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

                // converts table calculation to filterable table calculation
                // which is a sub-type of Field.
                const cals = (tableCalculations || []).reduce<
                    ItemsMap[string][]
                >((acc, cal) => {
                    const tableCalculationFilters = {
                        type: cal.type || TableCalculationType.NUMBER,
                        table: 'table_calculation',
                        label: cal.name,
                        tableLabel: 'Table Calculation',
                        hidden: true,
                        name: cal.name,
                        displayName: cal.displayName,
                        sql: cal.sql,
                    };
                    return [...acc, tableCalculationFilters];
                }, []);

                return [...visibleFields, ...customMetrics, ...cals].reduce(
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
    }, [exploreData, queryResults, additionalMetrics, tableCalculations]);

    return fieldsWithSuggestions;
};
