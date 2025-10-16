import {
    FilterOperator,
    countTotalFilterRules,
    getItemId,
    getTotalFilterRules,
    getVisibleFields,
    isFilterableField,
    overrideFilterGroupWithFilterRules,
    reduceRequiredDimensionFiltersToFilterRules,
    type Field,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { Badge, Text, Tooltip } from '@mantine/core';
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
    type FC,
} from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectFilters,
    selectIsEditMode,
    selectIsFiltersExpanded,
    selectMetricQuery,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import FiltersForm from '../../common/Filters';
import { getConditionalRuleLabelFromItem } from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import { useProcessedFilters } from './useProcessedFilters';
import { useFieldsWithSuggestions } from './useFieldsWithSuggestions';

const FiltersCard: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);

    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const filters = useExplorerSelector(selectFilters);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const dispatch = useExplorerDispatch();

    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data } = useExplore(tableName);

    // Helps smooth rendering
    const [, startTransition] = useTransition();

    const [hasDefaultFiltersApplied, setHasDefaultFiltersApplied] =
        useState(false);

    // Get processed filters from context (already being computed in background)
    const { processedFilters: workerProcessedFilters, isProcessing } =
        useProcessedFilters();

    // Fallback to raw filters until worker responds
    const processedFilters = workerProcessedFilters ?? filters;

    // Query rows
    const { queryResults } = useExplorerQuery();
    const rows = queryResults.rows;

    const setFilters = useCallback(
        (newFilters: Filters) => {
            dispatch(explorerActions.setFilters(newFilters));
        },
        [dispatch],
    );

    const onToggle = useCallback(() => {
        // Lower priority so paint stays responsive even if open triggers work
        startTransition(() => {
            dispatch(
                explorerActions.toggleExpandedSection(ExplorerSection.FILTERS),
            );
        });
    }, [dispatch, startTransition]);

    const totalActiveFilters: number = useMemo(
        // When closed, this counts the raw `filters` (cheap); when open, counts processed.
        () => countTotalFilterRules(filterIsOpen ? processedFilters : filters),
        [filterIsOpen, processedFilters, filters],
    );

    // Apply default filters (only when panel is open)
    useEffect(() => {
        if (!filterIsOpen) return; // Skip while hidden
        if (hasDefaultFiltersApplied) return;

        const defaultFilters = data?.tables[
            data?.baseTable as string
        ]?.requiredFilters?.filter((f: any) => f.required === false);

        if (data && defaultFilters && defaultFilters.length === 0) {
            setHasDefaultFiltersApplied(true);
            return;
        }

        const isEmptyMetricQuery =
            metricQuery.metrics.length === 0 &&
            metricQuery.tableCalculations.length === 0 &&
            metricQuery.dimensions.length === 0;

        if (
            isEditMode &&
            isEmptyMetricQuery &&
            data &&
            defaultFilters &&
            defaultFilters.length > 0
        ) {
            const reducedRules: FilterRule[] =
                reduceRequiredDimensionFiltersToFilterRules(
                    defaultFilters,
                    undefined,
                    data,
                );
            setHasDefaultFiltersApplied(true);
            setFilters({
                metrics: undefined,
                tableCalculations: undefined,
                dimensions: overrideFilterGroupWithFilterRules(
                    processedFilters.dimensions,
                    reducedRules,
                    undefined,
                ),
            });
        }
    }, [
        filterIsOpen,
        hasDefaultFiltersApplied,
        data,
        tableName,
        metricQuery,
        isEditMode,
        processedFilters.dimensions,
        setFilters,
    ]);

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData: data,
        rows,
        customDimensions,
        additionalMetrics,
        tableCalculations,
    });

    const filterRuleLabels = useMemo(() => {
        const allFilterRules = getTotalFilterRules(
            filterIsOpen ? processedFilters : filters,
        );
        const fields: Field[] = data ? getVisibleFields(data) : [];
        if (!allFilterRules.length || !fields.length) return [];

        return allFilterRules.map((filterRule) => {
            const field = fields.find(
                (f) => getItemId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const lbl = getConditionalRuleLabelFromItem(filterRule, field);
                return (
                    <div key={field.name}>
                        {lbl.field}: {lbl.operator}{' '}
                        {filterRule.operator !== FilterOperator.NULL &&
                        filterRule.operator !== FilterOperator.NOT_NULL ? (
                            <Text span fw={700}>
                                {lbl.value}
                            </Text>
                        ) : (
                            ''
                        )}
                    </div>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        });
    }, [filterIsOpen, processedFilters, filters, data]);

    return (
        <CollapsableCard
            isOpen={filterIsOpen}
            title="Filters"
            disabled={!tableName || (totalActiveFilters === 0 && !isEditMode)}
            toggleTooltip={
                totalActiveFilters === 0 && !isEditMode
                    ? 'This chart has no filters'
                    : ''
            }
            onToggle={onToggle}
            headerElement={
                <>
                    {isProcessing && filterIsOpen ? (
                        <Text color="gray" size="xs">
                            processing...
                        </Text>
                    ) : null}
                    {totalActiveFilters > 0 && !filterIsOpen ? (
                        <Tooltip
                            variant="xs"
                            arrowOffset={12}
                            label={
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                    }}
                                >
                                    {filterRuleLabels}
                                </div>
                            }
                            position="bottom-start"
                        >
                            <Badge color="gray" sx={{ textTransform: 'unset' }}>
                                {totalActiveFilters}{' '}
                                <Text span fw={500}>
                                    active filter
                                    {totalActiveFilters === 1 ? '' : 's'}
                                </Text>
                            </Badge>
                        </Tooltip>
                    ) : null}
                    {totalActiveFilters > 0 && filterIsOpen && !isEditMode ? (
                        <Text color="gray">
                            You must be in 'edit' or 'explore' mode to change
                            the filters
                        </Text>
                    ) : null}
                </>
            }
        >
            <FiltersProvider
                projectUuid={projectUuid}
                itemsMap={fieldsWithSuggestions}
                startOfWeek={
                    project.data?.warehouseConnection?.startOfWeek ?? undefined
                }
                popoverProps={{ withinPortal: true }}
                baseTable={data?.baseTable}
            >
                <FiltersForm
                    isEditMode={isEditMode}
                    filters={processedFilters}
                    setFilters={setFilters}
                />
            </FiltersProvider>
        </CollapsableCard>
    );
});

export default FiltersCard;
