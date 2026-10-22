import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
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
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
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
    useFocusLabelOnMount();
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
        ? 'Discard filter'
        : isDirty
          ? 'Discard changes'
          : null;
    const fieldCount = getFilterFields(filterRule, dashboardTiles).length;
    // A new filter with no field yet leaves through the footer's Cancel
    const hasDiscard = !(isPlaceholder && isNew) && discardLabel !== null;

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
                        New filter
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
                {!isNew && (
                    <ConfirmDeleteButton
                        aria-label="Remove filter"
                        tooltip="Click again to remove"
                        onConfirm={removeFilter}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                )}
                <Tooltip label="Collapse">
                    <ActionIcon
                        variant="subtle"
                        aria-label="Collapse filter"
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
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
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
    const rows = GROUPS.flatMap((group) =>
        dashboardFilters[group].map((rule) => {
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
    // A placeholder is not in the dashboard filters yet: it comes last. One
    // keyed list, so the editor keeps its state when its rule joins them
    const isListed = editor === null || rows.includes(editor);
    // Closing keeps the edits, so the footer says what closing would drop
    const footerStatus =
        editingRule === null || editor === null
            ? null
            : isPlaceholder
              ? 'Select a field to keep this filter'
              : isDefaultValueIncomplete(editingRule)
                ? 'No default value set, so the default stays off'
                : null;

    return (
        <EditorShell
            filterCount={
                dashboardFilters.dimensions.length +
                dashboardFilters.metrics.length
            }
            onClose={close}
            onCancel={editor !== null && isPlaceholder ? discard : null}
            footerStatus={footerStatus}
        >
            {isListed ? rows : [...rows, editor]}
        </EditorShell>
    );
};
