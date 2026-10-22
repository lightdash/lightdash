import {
    getDashboardFilterField,
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowBackUp,
    IconChevronDown,
    IconRotate2,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import {
    getFilterRuleRevertableObject,
    getFilterRuleWithDisabledState,
    hasSavedFilterValueChanged,
} from '../dashboardFilters/FilterConfiguration/utils';
import classes from './ControlSidebar.module.css';
import { EditorShell } from './EditorShell';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterRow, FilterTypeIcon } from './FilterRow';
import { FilterSettings } from './FilterSettings';
import { getFilterFields } from './peers';
import { getTilesSummary } from './railSummaries';
import {
    isDefaultValueIncomplete,
    isPlaceholderRule,
    withFilterRuleLabel,
} from './sidebarState';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';

type FilterEditorProps = {
    rule: DashboardFilterRule;
};

// Mounted with the filter id as key, so the label draft and the armed state
// never carry over to another control, and the label takes focus each time
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const emptiedFieldLabel = useControlsSidebarSelector(
        (c) => c.emptiedFieldLabel,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const removeFilter = useControlsSidebarSelector((c) => c.removeFilter);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const collapse = useControlsSidebarSelector((c) => c.collapse);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isSavedValue = useControlsSidebarSelector((c) => c.isSavedValue);
    const getUiString = useUiStrings();
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    useFocusLabelOnMount();
    // The name takes focus as the edit-mode label input does (`autoFocus`)
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => node?.focus(),
        [],
    );
    // As the control was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in filterRule);
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter(withFilterRuleLabel(filterRule, next, hadLabelKey)),
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const appliedTileCount = useAppliedTileCount(filterRule);
    // No props, so one element: typing a label does not re-render the list
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);

    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    // What the bar shows for a filter with no label: its field's name, or
    // the column's for a SQL column filter
    const fallbackName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    const discardLabel = isNew
        ? getUiString('filters.rail.discardFilter')
        : isDirty
          ? getUiString('filters.rail.discardChanges')
          : null;
    const fieldCount = getFilterFields(filterRule, dashboardTiles).length;
    // A new filter with no field yet leaves through the footer's Cancel
    const hasDiscard = !(isPlaceholder && isNew) && discardLabel !== null;
    // A viewer's filter has no label of its own: it goes by its field
    const viewerName = isPlaceholder
        ? (emptiedFieldLabel ?? getUiString('filters.rail.filterName'))
        : (filterRule.label ??
          fallbackName ??
          getUiString('filters.rail.filterName'));
    // A saved filter a viewer changed goes back to its saved value, as the
    // shipped popover's "Reset to original value" does
    const originalRule = isSavedValue
        ? ([
              ...(savedFilters?.dimensions ?? []),
              ...(savedFilters?.metrics ?? []),
          ].find((saved) => saved.id === filterRule.id) ?? null)
        : null;
    const isValueChanged =
        originalRule !== null &&
        hasSavedFilterValueChanged(originalRule, filterRule);
    const resetValue = () => {
        if (originalRule === null) return;
        updateFilter(
            getFilterRuleWithDisabledState(
                {
                    ...filterRule,
                    ...getFilterRuleRevertableObject(originalRule),
                },
                false,
            ),
        );
    };

    return (
        <Box className={classes.edited}>
            {/* A click on the head collapses the filter, as its chevron does;
                the name input and the buttons keep their own clicks */}
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.editedHead}
                onClick={(event) => {
                    if (
                        event.target instanceof Element &&
                        event.target.closest('input, button')
                    )
                        return;
                    collapse();
                }}
            >
                <FilterTypeIcon field={field} />
                {isPlaceholder && isNew ? (
                    <Text fz="sm" fw={600} flex={1}>
                        {getUiString('filters.rail.newFilter')}
                    </Text>
                ) : isViewer ? (
                    // Focus lands here when the filter opens
                    <Text
                        fz="sm"
                        fw={600}
                        flex={1}
                        truncate
                        tabIndex={-1}
                        ref={focusOnMount}
                        data-controls-label
                    >
                        {viewerName}
                    </Text>
                ) : (
                    <TextInput
                        aria-label="Filter label"
                        size="xs"
                        className={classes.nameInput}
                        classNames={{ input: classes.nameInputField }}
                        // Left empty, the filter goes by its field's name.
                        // An existing control that lost its last field keeps it
                        placeholder={
                            fallbackName ?? emptiedFieldLabel ?? 'Filter name'
                        }
                        autoFocus
                        data-controls-label
                        value={label.draft}
                        onChange={(event) =>
                            label.type(event.currentTarget.value)
                        }
                        // Synchronous, so a click on Done closes with the label
                        onBlur={label.flush}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            label.flush();
                        }}
                    />
                )}
                {isValueChanged && (
                    <Tooltip
                        label={getUiString('filters.config.resetToOriginal')}
                    >
                        <ActionIcon
                            variant="subtle"
                            aria-label={getUiString(
                                'filters.config.resetToOriginalAria',
                            )}
                            onClick={resetValue}
                        >
                            <MantineIcon icon={IconRotate2} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {hasDiscard && (
                    <Tooltip label={discardLabel}>
                        <ActionIcon
                            variant="subtle"
                            aria-label={discardLabel}
                            onClick={discard}
                        >
                            <MantineIcon icon={IconArrowBackUp} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {!isNew && !isSavedValue && (
                    <ConfirmDeleteButton
                        aria-label={getUiString('filters.rail.removeFilter')}
                        tooltip={getUiString('filters.rail.confirmRemove')}
                        onConfirm={removeFilter}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                )}
                <Tooltip label={getUiString('filters.rail.collapse')}>
                    <ActionIcon
                        variant="subtle"
                        aria-label={getUiString('filters.rail.collapseFilter')}
                        aria-expanded
                        onClick={collapse}
                    >
                        <MantineIcon icon={IconChevronDown} size={14} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Box className={classes.editedBody}>
                {isPlaceholder ? (
                    fieldsAndTiles
                ) : (
                    <FilterSettings
                        rule={filterRule}
                        field={field}
                        onChange={updateFilter}
                        tiles={fieldsAndTiles}
                        tilesSummary={getTilesSummary(
                            appliedTileCount,
                            fieldCount,
                            getUiString,
                        )}
                    />
                )}
            </Box>
        </Box>
    );
};

type FilterGroup = 'dimensions' | 'metrics';

/** For the dashboard grid's row, which holds the rail next to the grid. */
export const CONTROLS_RAIL_LAYOUT = classes.layout;

const GROUPS: FilterGroup[] = ['dimensions', 'metrics'];

export const ControlSidebar: FC = () => {
    const filterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    const open = useControlsSidebarSelector((c) => c.open);
    const setHoveredFilterId = useControlsSidebarSelector(
        (c) => c.setHoveredFilterId,
    );
    const clearHoveredFilterId = useControlsSidebarSelector(
        (c) => c.clearHoveredFilterId,
    );
    const close = useControlsSidebarSelector((c) => c.close);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardTemporaryFilters();
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const hasTabs = useDashboardSelector(
        (state) => selectDashboardTabs(state).length > 0,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // While fields load nothing resolves, which is not the same as invalid
    const areFieldsLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    // As the shipped pill: no editor until the fields exist
    const areFieldsLoaded = useDashboardContext(
        (c) => c.allFilterableFields !== undefined,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    if (!isRailOpen) return null;

    // Null while every filter is a row
    const editor =
        filterId === null || editingRule === null ? null : (
            <FilterEditor key={filterId} rule={editingRule} />
        );
    // A viewer's rail lists the saved filters, then their own
    const rowsOf = (filters: DashboardFilters, isOwn: boolean) =>
        GROUPS.flatMap((group) =>
            filters[group].map((rule) => {
                if (rule.id === filterId) return editor;
                const field =
                    getDashboardFilterField<DashboardFilterableField>(
                        group === 'metrics'
                            ? allFilterableMetricsMap
                            : allFilterableFieldsMap,
                        rule,
                        filterableFieldsByTileUuid,
                    ) ?? null;
                const isUnresolved =
                    field === null &&
                    !rule.target.isSqlColumn &&
                    !isPlaceholderRule(rule) &&
                    !areFieldsLoading;
                return (
                    <FilterRow
                        key={rule.id}
                        rule={rule}
                        field={field}
                        activeTabUuid={activeTabUuid}
                        hasTabs={hasTabs}
                        isOwn={isOwn}
                        // As the shipped pill: a viewer cannot open a locked one
                        isReadOnly={
                            isViewer &&
                            !isOwn &&
                            isFilterLockedOnTab(rule, activeTabUuid, hasTabs)
                        }
                        isDisabled={
                            isUnresolved ||
                            (!areFieldsLoaded && !rule.target.isSqlColumn)
                        }
                        onOpen={open}
                        onHover={setHoveredFilterId}
                        onUnhover={clearHoveredFilterId}
                    />
                );
            }),
        );
    const rows = [
        ...rowsOf(dashboardFilters, false),
        ...(isViewer ? rowsOf(temporaryFilters, true) : []),
    ];
    // A placeholder is not in the dashboard filters yet: it comes last. One
    // keyed list, so the editor keeps its state when its rule joins them
    const isListed = editor === null || rows.includes(editor);
    // Closing keeps the edits, so the footer says what closing would drop
    const footerStatus =
        editingRule === null || editor === null
            ? null
            : isPlaceholder
              ? getUiString('filters.rail.selectFieldToKeep')
              : !isViewer && isDefaultValueIncomplete(editingRule)
                ? 'No default value set, so the default stays off'
                : null;

    return (
        <EditorShell
            filterCount={
                dashboardFilters.dimensions.length +
                dashboardFilters.metrics.length +
                (isViewer
                    ? temporaryFilters.dimensions.length +
                      temporaryFilters.metrics.length
                    : 0)
            }
            onClose={close}
            onCancel={editor !== null && isPlaceholder ? discard : null}
            footerStatus={footerStatus}
        >
            {isListed ? rows : [...rows, editor]}
        </EditorShell>
    );
};
