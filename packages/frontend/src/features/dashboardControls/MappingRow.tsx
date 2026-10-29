import {
    getItemId,
    interpolateUiString,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { FilterPillButton } from '../dashboardFilters/ActiveFilters/FilterPillButton';
import { getCandidateOptions, getFieldCandidates } from './fieldCandidates';
import { formatTileCount } from './fieldLabels';
import editorClasses from './FilterEditor.module.css';
import {
    addFieldMarker,
    chipMarker,
    findChip,
    findFieldBarStart,
    findMappingFallback,
    isFocusLost,
    mappingRowMarker,
} from './mappingFocus';
import classes from './MappingRow.module.css';
import {
    applyFieldToUnfilteredTiles,
    canTileTakeFilter,
    doesTileOfferField,
    getFilterRows,
    getTakeableTabCounts,
    getTileField,
} from './peers';
import { useApplyBlockedReason } from './useApplyBlockedReason';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFieldTileActions } from './useFieldTileActions';
import { useFilterRuleField } from './useFilterRuleField';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NO_FIELDS: DashboardFilterableField[] = [];
// Past this many fields the menu is searchable, as a tile card's select
const SEARCH_THRESHOLD = 8;
const noop = () => {};
// The popover that held focus is gone: the row takes it, so Tab reaches the
// chips and Escape cancels from here
const focusOnMount = (node: HTMLElement | null) =>
    node?.focus({ preventScroll: true });

// A field of the filter's kind and type that is not a chip yet, with the
// tiles that have it and that the filter does not reach yet
type AddableField = {
    field: DashboardFilterableField;
    label: string;
    count: number;
};

const useAddableFields = (
    rule: DashboardFilterRule,
    chipLabels: string[],
): AddableField[] => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const dimensions = useDashboardContext(
        (c) => c.allFilterableFields ?? NO_FIELDS,
    );
    const metrics = useDashboardContext(
        (c) => c.allFilterableMetrics ?? NO_FIELDS,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const targetField = useFilterRuleField(rule);
    return useMemo(() => {
        // Nothing is offered while what the tiles have is not known
        if (targetField === null || fieldsByTile === undefined) return [];
        const tiles = dashboardTiles ?? [];
        const unfiltered = tiles.filter(
            (tile) =>
                getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) ===
                null,
        );
        const counted = uniqBy(
            getFieldCandidates(
                isMetric(targetField) ? metrics : dimensions,
                getFilterRows(rule, dashboardTiles),
                targetField,
            ),
            getItemId,
        )
            .map((field) => ({
                field,
                count: unfiltered.filter((tile) =>
                    doesTileOfferField(tile, getItemId(field), fieldsByTile),
                ).length,
            }))
            .filter(({ count }) => count > 0);
        const options = getCandidateOptions(
            counted.map(({ field }) => getItemId(field)),
            chipLabels,
            Object.fromEntries(
                counted.map(({ field }) => [getItemId(field), field]),
            ),
        );
        const labelled = counted.map((candidate, index) => ({
            ...candidate,
            label: options[index].label,
        }));
        // Two that still read the same say their table
        const isShared = (label: string) =>
            labelled.filter((candidate) => candidate.label === label).length >
            1;
        return labelled
            .map((candidate) =>
                isShared(candidate.label)
                    ? {
                          ...candidate,
                          label: `${candidate.label} (${candidate.field.table})`,
                      }
                    : candidate,
            )
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [
        rule,
        targetField,
        fieldsByTile,
        dashboardTiles,
        dimensions,
        metrics,
        sqlColumnsByTile,
        chipLabels,
    ]);
};

// "Add a field": the fitting fields on tiles not yet filtered. Picking one
// filters only those tiles, selects its chip and leaves Undo on the bar
const AddFieldMenu: FC<{
    rule: DashboardFilterRule;
    chipLabels: string[];
    onPicked: (fieldId: string) => void;
}> = ({ rule, chipLabels, onPicked }) => {
    const getUiString = useUiStrings();
    const [query, setQuery] = useState('');
    const applyWithUndo = useControlsSidebarSelector((c) => c.applyWithUndo);
    const setHighlightedFieldId = useControlsSidebarSelector(
        (c) => c.setHighlightedFieldId,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const addable = useAddableFields(rule, chipLabels);
    const hasAddable = addable.length > 0;
    const isSearchable = addable.length > SEARCH_THRESHOLD;
    const shown = isSearchable
        ? addable.filter(({ label }) =>
              label.toLowerCase().includes(query.trim().toLowerCase()),
          )
        : addable;

    const pick = ({ field, count }: AddableField) => {
        const fieldId = getItemId(field);
        // Selected first, so the write leaves its Undo on the bar
        setHighlightedFieldId(fieldId);
        applyWithUndo(
            applyFieldToUnfilteredTiles(
                rule,
                { fieldId, tableName: field.table },
                dashboardTiles ?? [],
                fieldsByTile,
                sqlColumnsByTile,
            ),
            {
                kind: 'add',
                fieldId,
                tileCount: count,
                replaced: 0,
                acrossTabs: true,
            },
        );
        onPicked(fieldId);
    };

    const searchRef = useRef<HTMLInputElement>(null);

    return (
        <Tooltip
            fz="xs"
            label={getUiString('filters.rail.noOtherField')}
            disabled={hasAddable}
        >
            <Box>
                <Menu
                    position="bottom-start"
                    offset={4}
                    transitionProps={{ duration: 0 }}
                    disabled={!hasAddable}
                    // Focus goes to the new chip, not back here
                    returnFocus={false}
                    // The menu focuses its own dropdown on open: search wins
                    onOpen={() =>
                        requestAnimationFrame(() =>
                            searchRef.current?.focus({ preventScroll: true }),
                        )
                    }
                    onClose={() => setQuery('')}
                >
                    <Menu.Target>
                        <Button
                            size="xs"
                            variant="default"
                            radius="xs"
                            className={classes.addChip}
                            {...addFieldMarker}
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            disabled={!hasAddable}
                        >
                            Add a field
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown
                        data-controls-editor
                        className={editorClasses.dropdown}
                    >
                        <Menu.Label>
                            Fields on tiles not yet filtered
                        </Menu.Label>
                        {isSearchable && (
                            <TextInput
                                size="xs"
                                m={4}
                                aria-label="Search fields"
                                placeholder={getUiString(
                                    'filters.rail.searchFields',
                                )}
                                leftSection={
                                    <MantineIcon icon={IconSearch} size={14} />
                                }
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.currentTarget.value)
                                }
                                ref={searchRef}
                            />
                        )}
                        {shown.length === 0 && (
                            <Text fz="xs" c="dimmed" px="sm" py={6}>
                                {getUiString('filters.tileCard.noFieldsMatch')}
                            </Text>
                        )}
                        {shown.map((candidate) => (
                            <Menu.Item
                                key={getItemId(candidate.field)}
                                rightSection={
                                    <Text fz="xs" c="dimmed">
                                        {formatTileCount(
                                            getUiString,
                                            candidate.count,
                                        )}
                                    </Text>
                                }
                                onClick={() => pick(candidate)}
                            >
                                {candidate.label}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </Box>
        </Tooltip>
    );
};

// "4 of 6 tiles · 2 tabs": every tile that can take the filter, and the tabs
// the filter reaches; no tabs part on a dashboard without tabs
const useMappingSummary = (
    rule: DashboardFilterRule,
): { summary: string; widest: string } => {
    const getUiString = useUiStrings();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    return useMemo(() => {
        // The tab counts' tiles too, so the tabs add up to this total
        const takeable = (dashboardTiles ?? []).filter((tile) =>
            canTileTakeFilter(tile, fieldsByTile, sqlColumnsByTile),
        );
        const total = takeable.length;
        const applied = takeable.filter(
            (tile) =>
                getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) !==
                null,
        ).length;
        const tabsReached =
            dashboardTabs.length < 2
                ? null
                : Object.values(
                      getTakeableTabCounts(
                          rule,
                          takeable,
                          dashboardTabs,
                          fieldsByTile,
                          sqlColumnsByTile,
                      ),
                  ).filter((count) => count.applied > 0).length;
        const format = (count: number, tabCount: number | null) => {
            const tileCount = `${interpolateUiString(
                getUiString('filters.rail.countOf'),
                { applied: count, total },
            )} ${getUiString(
                total === 1
                    ? 'filters.fieldBar.tilesOf.singular'
                    : 'filters.fieldBar.tilesOf.plural',
            )}`;
            return tabCount === null
                ? tileCount
                : `${tileCount} · ${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}`;
        };
        return {
            summary: format(applied, tabsReached),
            widest: format(
                total,
                tabsReached === null ? null : dashboardTabs.length,
            ),
        };
    }, [
        rule,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
        getUiString,
    ]);
};

const MappingRowContent: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const getUiString = useUiStrings();
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const hoveredFieldId = useControlsSidebarSelector((c) => c.hoveredFieldId);
    const setHighlightedFieldId = useControlsSidebarSelector(
        (c) => c.setHighlightedFieldId,
    );
    const clearHighlightedField = useControlsSidebarSelector(
        (c) => c.clearHighlightedField,
    );
    const setHoveredFieldId = useControlsSidebarSelector(
        (c) => c.setHoveredFieldId,
    );
    const cancelMapping = useControlsSidebarSelector((c) => c.cancelMapping);
    const close = useControlsSidebarSelector((c) => c.close);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const field = useFilterRuleField(rule);
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
    const applyBlockedReason = useApplyBlockedReason(rule);
    const { summary, widest } = useMappingSummary(rule);

    const rowIds = getFilterRows(rule, dashboardTiles);
    const chips = rowIds.map((fieldId) => ({
        fieldId,
        label: fieldTileActions?.forField(fieldId).label ?? fieldId,
    }));
    const chipLabelsKey = chips.map((chip) => chip.label).join('\n');
    const chipLabels = useMemo(
        () => (chipLabelsKey === '' ? [] : chipLabelsKey.split('\n')),
        [chipLabelsKey],
    );
    // Not saved for everyone yet: dashed, as on the bar
    const isDraft =
        savedFilters !== undefined &&
        ![...savedFilters.dimensions, ...savedFilters.metrics].some(
            (saved) => saved.id === rule.id,
        );

    // Focus follows the chips: to the one just added, and back to the one
    // deselected from the bar (else "Add a field") once the bar has gone
    const pendingChipFocus = useRef<string | null>(null);
    const lastSelected = useRef(highlightedFieldId);
    useLayoutEffect(() => {
        const previous = lastSelected.current;
        lastSelected.current = highlightedFieldId;
        const picked = pendingChipFocus.current;
        if (picked !== null) {
            const chip = findChip(picked);
            if (chip !== null) {
                pendingChipFocus.current = null;
                chip.focus();
            }
            return;
        }
        if (previous === null || highlightedFieldId !== null || !isFocusLost())
            return;
        (findChip(previous) ?? findMappingFallback())?.focus();
    });

    const hover = (fieldId: string, isHovered: boolean) => {
        if (isHovered) setHoveredFieldId(fieldId);
        else if (hoveredFieldId === fieldId) setHoveredFieldId(null);
    };

    return (
        <>
            {/* The open pill names the filter; it does nothing here */}
            <Box inert className={classes.pill}>
                <FilterPillButton
                    field={field ?? undefined}
                    filterRule={rule}
                    isOrphaned={false}
                    isPlain
                    isTemporary={isDraft}
                    isDraggable={false}
                    isLocked={false}
                    lockLabel={null}
                    onLockToggle={noop}
                    readOnlyLockLabel={null}
                    onRemove={null}
                    isTablesTooltipDisabled
                    data-open
                    onClick={noop}
                />
            </Box>
            <Group gap="xs" wrap="nowrap" className={classes.title}>
                <Text fz="sm" fw={600}>
                    Choose the tiles it filters
                </Text>
                <Text
                    fz="sm"
                    c="dimmed"
                    className={classes.summary}
                    data-reserve={widest}
                    aria-live="polite"
                >
                    <span>{summary}</span>
                </Text>
            </Group>
            <Text fz="sm" c="dimmed">
                via
            </Text>
            {chips.map(({ fieldId, label }) => {
                const isSelected = highlightedFieldId === fieldId;
                return (
                    <Button
                        key={fieldId}
                        size="xs"
                        variant="default"
                        radius="xs"
                        className={classes.chip}
                        aria-pressed={isSelected}
                        data-selected={isSelected || undefined}
                        {...chipMarker(fieldId)}
                        // The bar is portalled after the tiles: Tab goes there
                        onKeyDown={(event) => {
                            if (
                                event.key !== 'Tab' ||
                                event.shiftKey ||
                                !isSelected
                            )
                                return;
                            const start = findFieldBarStart();
                            if (start === null) return;
                            event.preventDefault();
                            start.focus();
                        }}
                        onClick={() =>
                            isSelected
                                ? clearHighlightedField()
                                : setHighlightedFieldId(fieldId)
                        }
                        onMouseEnter={() => hover(fieldId, true)}
                        onMouseLeave={() => hover(fieldId, false)}
                        onFocus={() => hover(fieldId, true)}
                        onBlur={() => hover(fieldId, false)}
                    >
                        {label}
                    </Button>
                );
            })}
            <AddFieldMenu
                rule={rule}
                chipLabels={chipLabels}
                onPicked={(fieldId) => {
                    pendingChipFocus.current = fieldId;
                }}
            />
            <Group gap="xs" wrap="nowrap" className={classes.actions}>
                <Button variant="default" size="xs" onClick={cancelMapping}>
                    {getUiString('filters.actions.cancel')}
                </Button>
                <Tooltip
                    fz="xs"
                    label={applyBlockedReason}
                    disabled={applyBlockedReason === null}
                >
                    <Box>
                        <Button
                            size="xs"
                            data-controls-apply
                            disabled={applyBlockedReason !== null}
                            onClick={close}
                        >
                            {getUiString('filters.apply')}
                        </Button>
                    </Box>
                </Tooltip>
            </Group>
        </>
    );
};

// In the filter row's place while tiles are chosen: the open pill, the title
// with its counts, a chip per field, "Add a field", Cancel and Apply
export const MappingRow: FC = () => {
    const rule = useControlsSidebarSelector((c) =>
        c.isMapping ? c.editingRule : null,
    );
    if (rule === null) return null;
    return (
        <Group
            className={classes.row}
            gap="xs"
            tabIndex={-1}
            ref={focusOnMount}
            data-controls-editor
            {...mappingRowMarker}
        >
            <MappingRowContent rule={rule} />
        </Group>
    );
};
