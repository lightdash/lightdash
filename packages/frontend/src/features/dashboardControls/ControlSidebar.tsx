import {
    interpolateUiString,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
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

// What the bar shows for a filter: its label, else its field's or column's name
const useFilterName = (rule: DashboardFilterRule | null): string | null => {
    const field = useFilterRuleField(rule);
    if (rule === null) return null;
    return (
        rule.label ??
        field?.label ??
        (rule.target.isSqlColumn ? rule.target.fieldId : null)
    );
};

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

// Cancel and Apply, or, after a click on another pill with changes unapplied,
// the question that pill asked
const Footer: FC = () => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const pendingRule = useControlsSidebarSelector((c) => c.pendingRule);
    const resolvePending = useControlsSidebarSelector((c) => c.resolvePending);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const close = useControlsSidebarSelector((c) => c.close);
    const getUiString = useUiStrings();
    const pendingName = useFilterName(pendingRule);
    const applyLabel = getUiString(
        isNew ? 'filters.rail.create' : 'filters.apply',
    );
    // The same button in both states, so focus stays on it
    const apply = (
        <Button
            size="xs"
            className={classes.apply}
            data-controls-apply
            disabled={isPlaceholder}
            onClick={pendingRule === null ? close : () => resolvePending(true)}
        >
            {applyLabel}
        </Button>
    );
    return (
        <Stack gap="xs" p="sm" className={classes.footer}>
            {pendingRule !== null && (
                <Text
                    fz="xs"
                    c="dimmed"
                    role="status"
                    className={classes.footerStatus}
                >
                    {interpolateUiString(
                        getUiString(
                            isNew
                                ? 'filters.rail.createBeforeOpening'
                                : 'filters.rail.applyBeforeOpening',
                        ),
                        {
                            filter:
                                pendingName ??
                                getUiString('filters.rail.filterName'),
                        },
                    )}
                </Text>
            )}
            <Group justify="flex-end" gap="xs" wrap="nowrap">
                {pendingRule === null ? (
                    <Button variant="default" size="xs" onClick={discard}>
                        {getUiString('filters.actions.cancel')}
                    </Button>
                ) : (
                    <Button
                        variant="default"
                        size="xs"
                        onClick={() => resolvePending(false)}
                    >
                        {getUiString('filters.rail.discard')}
                    </Button>
                )}
                {apply}
            </Group>
        </Stack>
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
    const focusWithoutScroll = useCallback(
        (node: HTMLElement | null) => node?.focus({ preventScroll: true }),
        [],
    );
    // The name takes focus on mount, as the edit-mode label input does.
    // A new filter has no name to edit: once a field is picked, the value
    // does, which mounts in the same commit
    const [isOpenedNew] = useState(() => isPlaceholder);
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => {
            if (node === null) return;
            if (!isOpenedNew) {
                node.focus({ preventScroll: true });
                return;
            }
            node.closest('[data-controls-editor]')
                ?.querySelector<HTMLElement>(
                    '[data-controls-value] input:not([type="hidden"])',
                )
                ?.focus({ preventScroll: true });
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
                            // Focused on mount without scrolling: the rail
                            // scrolls itself into view (`useRailIntoView`)
                            ref={focusWithoutScroll}
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
            <Footer />
        </>
    );
};

/** For the dashboard grid's row, which holds the rail next to the grid. */
export const CONTROLS_RAIL_LAYOUT = classes.layout;

// On screen only while a filter is edited: one filter at a time, finished
// with Cancel or Apply
export const ControlSidebar: FC = () => {
    const filterId = useControlsSidebarSelector((c) =>
        c.isSidebarOpen ? (c.editing?.filterId ?? null) : null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const labelId = useId();
    if (filterId === null || editingRule === null) return null;
    return (
        <EditorShell labelId={labelId}>
            <FilterEditor key={filterId} rule={editingRule} labelId={labelId} />
        </EditorShell>
    );
};
