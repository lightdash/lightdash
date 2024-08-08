import {
    ConditionalOperator,
    countTotalFilterRules,
    getItemId,
    getTotalFilterRules,
    getVisibleFields,
    isFilterableField,
    overrideFilterGroupWithFilterRules,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    type Field,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { Badge, Text, Tooltip } from '@mantine/core';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import CollapsableCard from '../../common/CollapsableCard';
import FiltersForm from '../../common/Filters';
import { getConditionalRuleLabel } from '../../common/Filters/FilterInputs';
import { FiltersProvider } from '../../common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from './useFieldsWithSuggestions';

const FiltersCard: FC = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const project = useProject(projectUuid);
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data } = useExplore(tableName);

    const refreshRequiredFiltersProperty = (filters: Filters): Filters => {
        if (!filters.dimensions) return filters;
        // The table metadata model required filters may have been updated.
        // We need to refresh the required filters property in the filter group to reflect any changes on the metadata model.
        if (!data || !data.tables[tableName]) return filters;

        const requiredFilters = data.tables[tableName].requiredFilters || [];
        // We transform the required filters to filter rules
        // filters is pass as undefined to guarantee all required filters are transform even if they already exist in the filter group
        const allRequiredFilters: FilterRule[] =
            reduceRequiredDimensionFiltersToFilterRules(
                requiredFilters,
                data.tables[tableName],
                undefined,
            );
        const allFilterRefs = allRequiredFilters.map(
            (filter) => filter.target.fieldId,
        );
        // We update the existing filter group with the required filters
        // If the required filter has been removed from the metadata model we remove the required flag from the filter
        const updatedDimensionFilters = resetRequiredFilterRules(
            filters.dimensions,
            allFilterRefs,
        );

        return {
            ...filters,
            dimensions: updatedDimensionFilters,
        };
    };
    const updateDimensionFiltersWithRequiredFilters = (
        unsavedQueryFilters: Filters,
    ) => {
        // Check if the table has required filters
        if (data && data.tables[tableName]) {
            const requiredFilters = data.tables[tableName].requiredFilters;
            if (requiredFilters && requiredFilters.length > 0) {
                // Only requiredFilters that refer to existing table dimensions are added to the unsavedQueryFilters
                // Transform requiredFilters to filterRules if the required filters are not already in the unsavedQueryFilters.
                const reducedRules: FilterRule[] =
                    reduceRequiredDimensionFiltersToFilterRules(
                        requiredFilters,
                        data.tables[tableName],
                        unsavedQueryFilters.dimensions,
                    );
                // Add to the existing filter rules with the missing required filter rules

                return {
                    ...unsavedQueryFilters,
                    dimensions: overrideFilterGroupWithFilterRules(
                        unsavedQueryFilters.dimensions,
                        reducedRules,
                    ),
                };
            }
        }
        return unsavedQueryFilters;
    };
    const resetDimensionFiltersIfNoModelSelected = (
        unsavedQueryFilters: Filters,
    ) => {
        // If no model is selected, reset the dimension filters
        // This is to prevent the user from selecting a model, then deselecting it, and still having the required filters applied
        if (tableName.length === 0) {
            return {
                ...unsavedQueryFilters,
                dimensions: undefined,
            };
        }
        return unsavedQueryFilters;
    };

    const filters = useExplorerContext((context) => {
        let unsavedQueryFilters =
            context.state.unsavedChartVersion.metricQuery.filters;

        // Refresh the required filters property as the required filters can change when the table dbt metadata changes
        unsavedQueryFilters =
            refreshRequiredFiltersProperty(unsavedQueryFilters);
        // Update the dimension filters with the required filters
        // (we add the required filters to the unsavedQueryFilters if they are not already there)
        unsavedQueryFilters =
            updateDimensionFiltersWithRequiredFilters(unsavedQueryFilters);
        // If no model is selected, or user has deselected the model with required filters, reset the dimension filters
        unsavedQueryFilters =
            resetDimensionFiltersIfNoModelSelected(unsavedQueryFilters);

        return unsavedQueryFilters;
    });

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const setFilters = useExplorerContext(
        (context) => context.actions.setFilters,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const filterIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.FILTERS),
        [expandedSections],
    );
    const totalActiveFilters: number = useMemo(
        () => countTotalFilterRules(filters),
        [filters],
    );
    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData: data,
        queryResults,
        customDimensions,
        additionalMetrics,
        tableCalculations,
    });
    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );
    const renderFilterRule = useCallback(
        (filterRule: FilterRule) => {
            const fields: Field[] = data ? getVisibleFields(data) : [];
            const field = fields.find(
                (f) => getItemId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const filterRuleLabels = getConditionalRuleLabel(
                    filterRule,
                    field,
                );
                return (
                    <div key={field.name}>
                        {filterRuleLabels.field}: {filterRuleLabels.operator}{' '}
                        {filterRule.operator !== ConditionalOperator.NULL &&
                        filterRule.operator !== ConditionalOperator.NOT_NULL ? (
                            <Text span fw={700}>
                                {filterRuleLabels.value}
                            </Text>
                        ) : (
                            ''
                        )}
                    </div>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        },
        [data],
    );

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
            onToggle={() => toggleExpandedSection(ExplorerSection.FILTERS)}
            headerElement={
                <>
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
                                    {allFilterRules.map(renderFilterRule)}
                                </div>
                            }
                            position="bottom-start"
                        >
                            <Badge
                                color="gray"
                                sx={{
                                    textTransform: 'unset',
                                }}
                            >
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
                popoverProps={{
                    withinPortal: true,
                }}
            >
                <FiltersForm
                    isEditMode={isEditMode}
                    filters={filters}
                    setFilters={setFilters}
                    baseTable={data?.baseTable}
                />
            </FiltersProvider>
        </CollapsableCard>
    );
});

export default FiltersCard;
