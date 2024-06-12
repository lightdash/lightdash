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
    type FilterGroup,
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

    const refreshRequiredFiltersProperty = (
        allFilter: FilterGroup | undefined,
    ) => {
        if (!allFilter) return;
        if (data && data.tables[tableName]) {
            const requiredFilters =
                data.tables[tableName].required_filters || [];
            const allRequiredFilters: FilterRule[] =
                reduceRequiredDimensionFiltersToFilterRules(
                    requiredFilters,
                    data.tables[tableName],
                    undefined,
                );
            const allFilterRefs = allRequiredFilters.map(
                (filter) => filter.target.fieldId,
            );
            resetRequiredFilterRules(allFilter, allFilterRefs);
        }
    };
    const updateDimensionFiltersWithRequiredFilters = (
        unsavedQueryFilters: Filters,
    ) => {
        if (data && data.tables[tableName]) {
            const requiredFilters = data.tables[tableName].required_filters;
            if (requiredFilters && requiredFilters.length > 0) {
                const reducedRules: FilterRule[] =
                    reduceRequiredDimensionFiltersToFilterRules(
                        requiredFilters,
                        data.tables[tableName],
                        unsavedQueryFilters.dimensions,
                    );
                unsavedQueryFilters.dimensions =
                    overrideFilterGroupWithFilterRules(
                        unsavedQueryFilters.dimensions,
                        reducedRules,
                    );
            }
        }
        return unsavedQueryFilters;
    };
    const resetDimensionFiltersIfNoModelSelected = (
        unsavedQueryFilters: Filters,
    ) => {
        if (tableName.length === 0) {
            unsavedQueryFilters.dimensions = undefined;
        }
        return unsavedQueryFilters;
    };
    const filters = useExplorerContext((context) => {
        let unsavedQueryFilters =
            context.state.unsavedChartVersion.metricQuery.filters;
        refreshRequiredFiltersProperty(unsavedQueryFilters.dimensions);
        unsavedQueryFilters =
            updateDimensionFiltersWithRequiredFilters(unsavedQueryFilters);
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
                />
            </FiltersProvider>
        </CollapsableCard>
    );
});

export default FiltersCard;
