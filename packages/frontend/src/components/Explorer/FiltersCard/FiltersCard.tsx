import { Button, Card, Collapse, H5, Tag } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    convertAdditionalMetric,
    countTotalFilterRules,
    DimensionType,
    Field,
    fieldId,
    FilterRule,
    getResultValues,
    getTotalFilterRules,
    getVisibleFields,
    isFilterableField,
    Metric,
} from '@lightdash/common';
import React, { FC, memo, useCallback, useEffect, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useExplore } from '../../../hooks/useExplore';
import { Context, ExplorerSection } from '../../../providers/ExplorerProvider';
import FiltersForm from '../../common/Filters';
import { getFilterRuleLabel } from '../../common/Filters/configs';
import {
    FieldsWithSuggestions,
    FiltersProvider,
} from '../../common/Filters/FiltersProvider';
import { CardHeader, FilterValues, Tooltip } from './FiltersCard.styles';

const FiltersCard: FC = memo(() => {
    const expandedSections = useContextSelector(
        Context,
        (context) => context!.state.expandedSections,
    );
    const isEditMode = useContextSelector(
        Context,
        (context) => context!.state.isEditMode,
    );
    const tableName = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.tableName,
    );
    const filters = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.metricQuery.filters,
    );
    const additionalMetrics = useContextSelector(
        Context,
        (context) =>
            context!.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const queryResults = useContextSelector(
        Context,
        (context) => context!.queryResults,
    );
    const setFilters = useContextSelector(
        Context,
        (context) => context!.actions.setFilters,
    );
    const toggleExpandedSection = useContextSelector(
        Context,
        (context) => context!.actions.toggleExpandedSection,
    );
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
    const allFilterRules = getTotalFilterRules(filters);
    const renderFilterRule = useCallback(
        (filterRule: FilterRule) => {
            const fields: Field[] = explore.data
                ? getVisibleFields(explore.data)
                : [];
            const field = fields.find(
                (f) => fieldId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const filterRuleLabels = getFilterRuleLabel(filterRule, field);
                return (
                    <Tooltip key={field.name}>
                        {filterRuleLabels.field}: {filterRuleLabels.operator}{' '}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </Tooltip>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        },
        [explore],
    );
    return (
        <Card style={{ padding: 5 }} elevation={1}>
            <CardHeader>
                <Tooltip2
                    content={`You must be in 'edit' or 'explore' mode to view this panel`}
                    interactionKind="hover"
                    placement={'bottom-start'}
                    disabled={isEditMode}
                >
                    <Button
                        icon={filterIsOpen ? 'chevron-down' : 'chevron-right'}
                        minimal
                        disabled={!isEditMode || !tableName}
                        onClick={() =>
                            toggleExpandedSection(ExplorerSection.FILTERS)
                        }
                    />
                </Tooltip2>
                <H5>Filters</H5>
                {totalActiveFilters > 0 && !filterIsOpen ? (
                    <Tooltip2
                        content={<>{allFilterRules.map(renderFilterRule)}</>}
                        interactionKind="hover"
                        placement={'bottom-start'}
                    >
                        <Tag>{totalActiveFilters} active filters</Tag>
                    </Tooltip2>
                ) : null}
            </CardHeader>
            <Collapse isOpen={isEditMode && filterIsOpen}>
                <FiltersProvider fieldsMap={fieldsWithSuggestions}>
                    <FiltersForm filters={filters} setFilters={setFilters} />
                </FiltersProvider>
            </Collapse>
        </Card>
    );
});

export default FiltersCard;
