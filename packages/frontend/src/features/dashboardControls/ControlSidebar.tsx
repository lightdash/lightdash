import {
    assertUnreachable,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import omit from 'lodash/omit';
import { useCallback, useId, useMemo, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import classes from './ControlSidebar.module.css';
import { EditorFooter } from './EditorFooter';
import { EditorShell } from './EditorShell';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterSettings } from './FilterSettings';
import { getFilterFields } from './peers';
import { getTilesSummary } from './railSummaries';
import { withFilterRuleLabel } from './sidebarState';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';
import { ZoomEditor } from './ZoomEditor';

const FilterTypeIcon: FC<{ field: DashboardFilterableField | null }> = ({
    field,
}) =>
    field !== null ? (
        <FieldIcon item={field} size={14} className={classes.typeIcon} />
    ) : (
        <MantineIcon
            icon={IconFilter}
            size={14}
            color="dimmed"
            className={classes.typeIcon}
        />
    );

const NO_SECTION = 'none';

// Which section the filter sits in on the bar, written live like any edit
const SectionSelect: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const sections = useDashboardSelector(selectControlSections);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    if (sections.length === 0) return null;
    const value =
        rule.sectionId !== undefined &&
        sections.some((section) => section.id === rule.sectionId)
            ? rule.sectionId
            : NO_SECTION;
    return (
        <Select
            size="xs"
            label="Section"
            allowDeselect={false}
            data={[
                { value: NO_SECTION, label: 'None' },
                ...sections.map((section) => ({
                    value: section.id,
                    label: section.name || 'Untitled section',
                })),
            ]}
            value={value}
            onChange={(next) => {
                if (next === null || next === value) return;
                updateFilter(
                    next === NO_SECTION
                        ? omit(rule, 'sectionId')
                        : { ...rule, sectionId: next },
                );
            }}
        />
    );
};

type FilterEditorProps = {
    rule: DashboardFilterRule;
    labelId: string;
};

// Mounted with the filter id as key, so the label draft never carries over
// to another control, and the label takes focus each time
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule, labelId }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const emptiedFieldLabel = useControlsSidebarSelector(
        (c) => c.emptiedFieldLabel,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    useFocusLabelOnMount();
    // The name takes focus as the edit-mode label input does (`autoFocus`).
    // A new filter has no name to edit: once a field is picked, the value
    // does, which mounts in the same commit
    const [isOpenedNew] = useState(() => isPlaceholder);
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => {
            if (node === null) return;
            if (!isOpenedNew) {
                node.focus();
                return;
            }
            node.closest('[data-controls-editor]')
                ?.querySelector<HTMLElement>(
                    '[data-controls-value] input:not([type="hidden"])',
                )
                ?.focus();
        },
        [isOpenedNew],
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
    const fieldName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    const fieldCount = getFilterFields(filterRule, dashboardTiles).length;
    const isStarting = isPlaceholder && isNew;
    const name = isStarting
        ? getUiString('filters.rail.newFilter')
        : isPlaceholder
          ? (filterRule.label ??
            emptiedFieldLabel ??
            getUiString('filters.rail.filterName'))
          : (filterRule.label ??
            fieldName ??
            getUiString('filters.rail.filterName'));
    return (
        <>
            <Group
                gap="xs"
                wrap="nowrap"
                px="md"
                py="xs"
                className={classes.header}
            >
                {/* No field yet: no type to show */}
                {!isPlaceholder && <FilterTypeIcon field={field} />}
                {/* A viewer's filter has no label input: focus lands here */}
                <Text
                    id={labelId}
                    fz="sm"
                    fw={600}
                    flex={1}
                    truncate
                    {...(isViewer && !isStarting
                        ? {
                              tabIndex: -1,
                              ref: focusOnMount,
                              'data-controls-label': true,
                          }
                        : {})}
                >
                    {name}
                </Text>
                {isDirty && (
                    <Badge size="sm">
                        {getUiString(
                            isNew
                                ? 'filters.rail.newBadge'
                                : 'filters.rail.editedBadge',
                        )}
                    </Badge>
                )}
            </Group>
            <Box className={classes.body}>
                <Stack gap="xs" className={classes.content}>
                    {!isViewer && !isStarting && (
                        <TextInput
                            label="Name"
                            size="xs"
                            // Left empty, the filter goes by its field's name.
                            // An existing control that lost its last field keeps it
                            placeholder={
                                fieldName ?? emptiedFieldLabel ?? 'Filter name'
                            }
                            autoFocus
                            data-controls-label
                            value={label.draft}
                            onChange={(event) =>
                                label.type(event.currentTarget.value)
                            }
                            // Synchronous, so a click on Apply keeps the label
                            onBlur={label.flush}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                label.flush();
                            }}
                        />
                    )}
                    {isPlaceholder ? (
                        fieldsAndTiles
                    ) : (
                        <FilterSettings
                            rule={filterRule}
                            field={field}
                            onChange={updateFilter}
                            sectionSelect={
                                isViewer ? null : (
                                    <SectionSelect rule={filterRule} />
                                )
                            }
                            tiles={fieldsAndTiles}
                            tilesSummary={getTilesSummary(
                                appliedTileCount,
                                fieldCount,
                                getUiString,
                            )}
                        />
                    )}
                </Stack>
            </Box>
            <EditorFooter isApplyDisabled={isPlaceholder} hint={null} />
        </>
    );
};

/** For the dashboard grid's row, which holds the rail next to the grid. */
export const CONTROLS_RAIL_LAYOUT = classes.layout;

// On screen only while a control is edited: one filter or date zoom at a
// time, finished with Cancel or Apply
export const ControlSidebar: FC = () => {
    const editing = useControlsSidebarSelector((c) =>
        c.isSidebarOpen ? c.editing : null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const editingZoom = useControlsSidebarSelector((c) => c.editingZoom);
    const labelId = useId();
    if (editing === null) return null;
    switch (editing.kind) {
        case 'filter':
            return editingRule === null ? null : (
                <EditorShell labelId={labelId}>
                    <FilterEditor
                        key={editing.filterId}
                        rule={editingRule}
                        labelId={labelId}
                    />
                </EditorShell>
            );
        case 'dateZoom':
            return editingZoom === null ? null : (
                <EditorShell labelId={labelId}>
                    <ZoomEditor
                        key={editing.controlUuid}
                        control={editingZoom}
                        labelId={labelId}
                    />
                </EditorShell>
            );
        default:
            return assertUnreachable(editing, 'Unknown edited control');
    }
};
