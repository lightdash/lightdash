import { Button, Card, Collapse, H5, Tag } from '@blueprintjs/core';
import {
    convertAdditionalMetric,
    countTotalFilterRules,
    DimensionType,
    fieldId,
    getResultValues,
    getVisibleFields,
    isFilterableField,
    Metric,
} from 'common';
import { FC, useEffect, useState } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import FiltersForm from '../../common/Filters';
import {
    FieldsWithSuggestions,
    FiltersProvider,
} from '../../common/Filters/FiltersProvider';
import { CardHeader } from './FiltersCard.styles';

const FiltersCard: FC = () => {
    const {
        state: {
            expandedSections,
            unsavedChartVersion: {
                tableName,
                metricQuery: { filters, additionalMetrics },
            },
        },
        queryResults,
        actions: { setFilters, toggleExpandedSection },
    } = useExplorer();
    const explore = useExplore(tableName);
    const filterIsOpen = expandedSections.includes(ExplorerSection.FILTERS);
    const totalActiveFilters: number = countTotalFilterRules(filters);
    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});
    useEffect(() => {
        if (explore.data) {
            setFieldsWithSuggestions((prev) => {
                const visibleFields = getVisibleFields(explore.data);
                const customMetrics = (additionalMetrics || []).reduce<
                    Metric[]
                >((acc, additionalMetric) => {
                    const table = explore.data.tables[additionalMetric.table];
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
                                    (queryResults.data &&
                                        getResultValues(
                                            queryResults.data.rows,
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
    }, [explore.data, queryResults.data, additionalMetrics]);
    return (
        <Card style={{ padding: 5 }} elevation={1}>
            <CardHeader>
                <Button
                    icon={filterIsOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={() =>
                        toggleExpandedSection(ExplorerSection.FILTERS)
                    }
                />
                <H5>Filters</H5>
                {totalActiveFilters > 0 && !filterIsOpen ? (
                    <Tag style={{ marginLeft: '10px' }}>
                        {totalActiveFilters} active filters
                    </Tag>
                ) : null}
            </CardHeader>
            <Collapse isOpen={filterIsOpen}>
                <FiltersProvider fieldsMap={fieldsWithSuggestions}>
                    <FiltersForm filters={filters} setFilters={setFilters} />
                </FiltersProvider>
            </Collapse>
        </Card>
    );
};

export default FiltersCard;
