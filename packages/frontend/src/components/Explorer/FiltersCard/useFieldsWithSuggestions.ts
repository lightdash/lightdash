import {
    convertAdditionalMetric,
    DimensionType,
    getFields,
    getItemId,
    getResultValueArray,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    type AdditionalMetric,
    type CustomDimension,
    type Explore,
    type FilterableField,
    type Metric,
    type ResultRow,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useState } from 'react';

interface FieldsWithSuggestionsHookParams {
    exploreData: Explore | undefined;
    rows: ResultRow[] | undefined;
    customDimensions: CustomDimension[] | undefined;
    additionalMetrics: AdditionalMetric[] | undefined;
    tableCalculations: TableCalculation[] | undefined;
    /**
     * Hidden fields are excluded from field pickers, but they can still be
     * targeted by existing filters that need to resolve their field.
     */
    includeHiddenFields: boolean;
}

export type FieldWithSuggestions = FilterableField & {
    suggestions?: string[];
};

export type FieldsWithSuggestions = Record<string, FieldWithSuggestions>;

export const useFieldsWithSuggestions = ({
    exploreData,
    rows,
    customDimensions,
    additionalMetrics,
    tableCalculations,
    includeHiddenFields,
}: FieldsWithSuggestionsHookParams) => {
    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});

    useEffect(() => {
        if (exploreData) {
            setFieldsWithSuggestions((prev) => {
                const exploreFields = getFields(exploreData).filter(
                    ({ hidden }) => includeHiddenFields || !hidden,
                );
                const customMetrics = (additionalMetrics || []).reduce<
                    Metric[]
                >((acc, additionalMetric) => {
                    const table = exploreData.tables[additionalMetric.table];
                    if (table) {
                        const metric = convertAdditionalMetric({
                            additionalMetric,
                            table,
                        });
                        acc.push(metric);
                    }
                    return acc;
                }, []);

                return [
                    ...exploreFields,
                    ...(customDimensions || []),
                    ...customMetrics,
                    ...(tableCalculations || []),
                ].reduce((sum, field) => {
                    if (isFilterableField(field)) {
                        let suggestions: string[] = [];
                        const type = isCustomSqlDimension(field)
                            ? field.dimensionType
                            : field.type;
                        // A label dimension must always fetch labelled values from
                        // the warehouse; harvesting raw result values masks the labels.
                        const hasLabelDimension =
                            isDimension(field) &&
                            !!field.filterAutocomplete?.labelDimension;
                        if (
                            type === DimensionType.STRING &&
                            !hasLabelDimension
                        ) {
                            const currentSuggestions =
                                prev[getItemId(field)]?.suggestions || [];
                            const newSuggestions: string[] =
                                (rows &&
                                    getResultValueArray(
                                        rows,
                                        true,
                                        false,
                                        true,
                                    ).results.reduce<string[]>((acc, row) => {
                                        const value = row[getItemId(field)];
                                        if (typeof value === 'string') {
                                            acc.push(value);
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
                        sum[getItemId(field)] = {
                            ...field,
                            suggestions,
                        };
                    }
                    return sum;
                }, {} as FieldsWithSuggestions);
            });
        }
    }, [
        exploreData,
        rows,
        additionalMetrics,
        tableCalculations,
        customDimensions,
        includeHiddenFields,
    ]);

    return fieldsWithSuggestions;
};
