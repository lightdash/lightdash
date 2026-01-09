import {
    DimensionType,
    ExploreType,
    FilterOperator,
    countTotalFilterRules,
    getFilterRuleFromFieldWithDefaultValue,
    getItemId,
    getItemMap,
    getTotalFilterRules,
    getVisibleFields,
    isDimension,
    isFilterableField,
    isMetric,
    overrideFilterGroupWithFilterRules,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    type AndFilterGroup,
    type FilterRule,
    type FilterableField,
    type FilterableItem,
    type Filters,
    type ParametersValuesMap,
} from '@lightdash/common';
import { Badge, Text, Tooltip } from '@mantine/core';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getMetricFlowDimensionValues } from '../../../api/MetricFlowAPI';
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
import useSemanticLayerDimensions from '../../../features/metricFlow/hooks/useSemanticLayerDimensions';
import { convertMetricQueryToMetricFlowQuery } from '../../../features/metricFlow/utils/convertMetricQueryToMetricFlowQuery';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import FiltersForm from '../../common/Filters';
import { getConditionalRuleLabelFromItem } from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
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
    const isSemanticLayerExplore = data?.type === ExploreType.SEMANTIC_LAYER;
    const metricFlowQuery = useMemo(() => {
        if (!isSemanticLayerExplore || !data) return undefined;
        return convertMetricQueryToMetricFlowQuery(metricQuery, data);
    }, [data, isSemanticLayerExplore, metricQuery]);
    const selectedMetricNames = metricFlowQuery?.metrics ?? {};
    const hasSelectedMetrics = Object.keys(selectedMetricNames).length > 0;
    const { data: semanticLayerDimensions } = useSemanticLayerDimensions(
        projectUuid,
        selectedMetricNames,
        {
            enabled:
                isSemanticLayerExplore && hasSelectedMetrics && !!projectUuid,
        },
    );
    const availableDimensionNames = useMemo(() => {
        if (!isSemanticLayerExplore || !hasSelectedMetrics) return undefined;
        if (!semanticLayerDimensions) return undefined;
        return new Set(
            semanticLayerDimensions.dimensions.map((dimension) =>
                dimension.name.toLowerCase(),
            ),
        );
    }, [hasSelectedMetrics, isSemanticLayerExplore, semanticLayerDimensions]);

    // Cache visible fields to avoid repeated expensive flatMap operations
    const visibleFields = useMemo(
        () => (data ? getVisibleFields(data) : []),
        [data],
    );

    const [hasDefaultFiltersApplied, setHasDefaultFiltersApplied] =
        useState(false);

    // Lazy mount: Only mount FiltersForm after first open to avoid expensive initial render
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen && !hasEverOpened) {
            setHasEverOpened(true);
        }
    }, [filterIsOpen, hasEverOpened]);

    const processedFilters = useMemo(() => {
        let unsavedQueryFilters = filters;

        // Step 1: Refresh the required filters property
        // (required filters can change when the table dbt metadata changes)
        if (unsavedQueryFilters.dimensions && data?.tables?.[data.baseTable]) {
            const requiredFilters =
                data.tables[data.baseTable].requiredFilters || [];
            const allRequiredFilters: FilterRule[] =
                reduceRequiredDimensionFiltersToFilterRules(
                    requiredFilters,
                    undefined,
                    data,
                );
            const allFilterRefs = allRequiredFilters.map(
                (filter) => filter.target.fieldId,
            );
            const updatedDimensionFilters = resetRequiredFilterRules(
                unsavedQueryFilters.dimensions,
                allFilterRefs,
            );
            unsavedQueryFilters = {
                ...unsavedQueryFilters,
                dimensions: updatedDimensionFilters,
            };
        }

        // Step 2: Update the dimension filters with the required filters
        // (add the required filters to the unsavedQueryFilters if they are not already there)
        if (data?.tables?.[data.baseTable]) {
            const requiredFilters = data.tables[
                data.baseTable
            ].requiredFilters?.filter((filter) => filter.required !== false);
            if (requiredFilters && requiredFilters.length > 0) {
                const reducedRules: FilterRule[] =
                    reduceRequiredDimensionFiltersToFilterRules(
                        requiredFilters,
                        unsavedQueryFilters.dimensions,
                        data,
                    );
                unsavedQueryFilters = {
                    ...unsavedQueryFilters,
                    dimensions: overrideFilterGroupWithFilterRules(
                        unsavedQueryFilters.dimensions,
                        reducedRules,
                        undefined,
                    ),
                };
            }
        }

        // Step 3: If no model is selected, reset the dimension filters
        if (tableName.length === 0) {
            if (hasDefaultFiltersApplied) setHasDefaultFiltersApplied(false);
            unsavedQueryFilters = {
                ...unsavedQueryFilters,
                dimensions: undefined,
            };
        }

        return unsavedQueryFilters;
    }, [filters, data, tableName, hasDefaultFiltersApplied]);

    // Get query rows from new hook
    const { queryResults } = useExplorerQuery();
    const rows = queryResults.rows;

    const setFilters = useCallback(
        (newFilters: Filters) => {
            dispatch(explorerActions.setFilters(newFilters));
        },
        [dispatch],
    );
    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const totalActiveFilters: number = useMemo(
        () => countTotalFilterRules(processedFilters),
        [processedFilters],
    );
    const metricFlowFilterFieldNames = useMemo(
        () =>
            new Set(
                getTotalFilterRules(processedFilters).map(
                    (rule) => rule.target.fieldId,
                ),
            ),
        [processedFilters],
    );

    useEffect(() => {
        if (hasDefaultFiltersApplied) return;
        const defaultFilters = data?.tables[
            data.baseTable
        ]?.requiredFilters?.filter((filter) => filter.required === false);

        if (
            data &&
            defaultFilters !== undefined &&
            defaultFilters.length === 0
        ) {
            // No default filters
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
        hasDefaultFiltersApplied,
        data,
        tableName,
        metricQuery,
        isEditMode,
        processedFilters.dimensions,
        setFilters,
    ]);

    // Only compute expensive field suggestions when panel is open
    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData: data,
        rows: filterIsOpen ? rows : undefined,
        customDimensions,
        additionalMetrics,
        tableCalculations,
    });

    const metricFlowFilterFields = useMemo<
        Record<string, FilterableField & { suggestions?: string[] }>
    >(() => {
        if (!data) return {};
        const tableDimensions = Object.values(data.tables).flatMap((table) =>
            Object.entries(table.dimensions),
        );
        return tableDimensions.reduce<
            Record<string, FilterableField & { suggestions?: string[] }>
        >((acc, [fieldId, field]) => {
            if (!isDimension(field)) return acc;
            if (field.isIntervalBase) return acc;
            if (
                (field.type === DimensionType.TIMESTAMP ||
                    field.type === DimensionType.DATE) &&
                !field.timeInterval
            ) {
                return acc;
            }
            if (availableDimensionNames) {
                const baseName =
                    field.timeIntervalBaseDimensionName?.toLowerCase();
                const fieldName = field.name.toLowerCase();
                if (
                    !availableDimensionNames.has(fieldName) &&
                    (!baseName || !availableDimensionNames.has(baseName)) &&
                    !metricFlowFilterFieldNames.has(field.name)
                ) {
                    return acc;
                }
            }
            acc[field.name] = fieldsWithSuggestions[fieldId] ?? field;
            return acc;
        }, {});
    }, [
        availableDimensionNames,
        data,
        fieldsWithSuggestions,
        metricFlowFilterFieldNames,
    ]);

    const metricFlowMetricNames = useMemo(() => {
        if (!data) return [];
        const itemsMap = getItemMap(data);
        return metricQuery.metrics.reduce<string[]>((acc, fieldId) => {
            const field = itemsMap[fieldId];
            if (field && isMetric(field)) {
                acc.push(field.name);
            }
            return acc;
        }, []);
    }, [data, metricQuery.metrics]);

    const metricFlowAutocompleteKey = useMemo(
        () => metricFlowMetricNames.slice().sort().join(','),
        [metricFlowMetricNames],
    );

    const metricFlowFieldValuesRequest = useCallback(
        async (args: {
            projectUuid: string;
            field: FilterableItem;
            fieldId: string;
            tableName?: string;
            search: string;
            forceRefresh: boolean;
            filters: AndFilterGroup | undefined;
            limit: number;
            parameterValues?: ParametersValuesMap;
        }) =>
            getMetricFlowDimensionValues(args.projectUuid, {
                dimension: args.field.name,
                metrics:
                    metricFlowMetricNames.length > 0
                        ? metricFlowMetricNames
                        : undefined,
                search: args.search,
                limit: args.limit,
            }),
        [metricFlowMetricNames],
    );

    const getMetricFlowFieldId = useCallback(
        (field: FilterableField) => field.name,
        [],
    );

    const createMetricFlowFilterRule = useCallback(
        (field: FilterableField, value?: any) =>
            getFilterRuleFromFieldWithDefaultValue(
                field,
                {
                    id: uuidv4(),
                    target: { fieldId: field.name },
                    operator:
                        value === null
                            ? FilterOperator.NULL
                            : FilterOperator.EQUALS,
                },
                value ? [value] : [],
            ),
        [],
    );

    // Pre-compute filter rule labels for tooltip
    const filterRuleLabels = useMemo(() => {
        return getTotalFilterRules(processedFilters).map((filterRule) => {
            const field = visibleFields.find((f) =>
                isSemanticLayerExplore
                    ? f.name === filterRule.target.fieldId
                    : getItemId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const labels = getConditionalRuleLabelFromItem(
                    filterRule,
                    field,
                );
                return (
                    <div key={field.name}>
                        {labels.field}: {labels.operator}{' '}
                        {filterRule.operator !== FilterOperator.NULL &&
                        filterRule.operator !== FilterOperator.NOT_NULL ? (
                            <Text span fw={700}>
                                {labels.value}
                            </Text>
                        ) : (
                            ''
                        )}
                    </div>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        });
    }, [processedFilters, visibleFields, isSemanticLayerExplore]);

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
                                    {filterRuleLabels}
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
            {hasEverOpened && (
                <FiltersProvider
                    projectUuid={projectUuid}
                    itemsMap={
                        isSemanticLayerExplore
                            ? metricFlowFilterFields
                            : fieldsWithSuggestions
                    }
                    startOfWeek={
                        project.data?.warehouseConnection?.startOfWeek ??
                        undefined
                    }
                    popoverProps={{
                        withinPortal: true,
                    }}
                    baseTable={data?.baseTable}
                    autocompleteEnabled={
                        isSemanticLayerExplore ? true : undefined
                    }
                    autocompleteKey={
                        isSemanticLayerExplore
                            ? metricFlowAutocompleteKey
                            : undefined
                    }
                    fieldValuesRequest={
                        isSemanticLayerExplore
                            ? metricFlowFieldValuesRequest
                            : undefined
                    }
                    getFieldId={
                        isSemanticLayerExplore
                            ? getMetricFlowFieldId
                            : undefined
                    }
                    createFilterRule={
                        isSemanticLayerExplore
                            ? createMetricFlowFilterRule
                            : undefined
                    }
                >
                    <FiltersForm
                        isEditMode={isEditMode}
                        filters={processedFilters}
                        setFilters={setFilters}
                    />
                </FiltersProvider>
            )}
        </CollapsableCard>
    );
});

export default FiltersCard;
