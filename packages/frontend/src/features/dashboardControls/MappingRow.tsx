import {
    getDashboardFilterableFieldKey,
    getDashboardFilterField,
    getItemId,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Button, Group, Popover, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
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
import { FilterPillButton } from '../dashboardFilters/ActiveFilters/FilterPillButton';
import addFilterClasses from '../dashboardFilters/AddFilterButton.module.css';
import FilterFieldSelect from '../dashboardFilters/FilterConfiguration/FilterFieldSelect';
import { DropdownClass } from './DropdownClass';
import { getFieldCandidates } from './fieldCandidates';
import { formatTilesOf } from './fieldLabels';
import editorClasses from './FilterEditor.module.css';
import {
    addFieldMarker,
    chipMarker,
    findChip,
    findFieldBarStart,
    findMappingFallback,
    focusOnMount,
    isFocusLost,
    mappingRowMarker,
} from './mappingFocus';
import classes from './MappingRow.module.css';
import { MENU_TRANSITION } from './menuTransition';
import {
    applyFieldToUnfilteredTiles,
    canTileTakeFilter,
    doesTileOfferField,
    getFilterChips,
    getTileField,
    isTileInRow,
} from './peers';
import { useRailContractClasses } from './railContractClasses';
import { useApplyBlockedReason } from './useApplyBlockedReason';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFieldTileActions } from './useFieldTileActions';
import { useFilterFieldsMap } from './useFilterFieldsMap';
import { useFilterRuleField } from './useFilterRuleField';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NO_FIELDS: DashboardFilterableField[] = [];
const NO_TILE_FIELDS: Record<string, DashboardFilterableField[]> = {};
const noop = () => {};

// The fields of the filter's kind and type that are not chips yet, as the
// tiles the filter does not reach yet label them
const useAddableFields = (
    rule: DashboardFilterRule,
): DashboardFilterableField[] => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useFilterFieldsMap();
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const targetField = useFilterRuleField(rule);
    return useMemo(() => {
        // Nothing is offered while what the tiles have is not known
        if (targetField === null || fieldsByTile === undefined) return [];
        const chipKeys = new Set(
            getFilterChips(
                rule,
                dashboardTiles,
                fieldsByTile,
                fieldsMap,
                sqlColumnsByTile,
            ).map((chip) => chip.key),
        );
        const offered = (dashboardTiles ?? [])
            .filter(
                (tile) =>
                    getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) ===
                    null,
            )
            .flatMap((tile) => fieldsByTile[tile.uuid] ?? NO_FIELDS)
            .filter((field) => isMetric(field) === isMetric(targetField));
        return uniqBy(
            getFieldCandidates(offered, [], targetField),
            getDashboardFilterableFieldKey,
        ).filter(
            (field) => !chipKeys.has(getDashboardFilterableFieldKey(field)),
        );
    }, [
        rule,
        targetField,
        fieldsByTile,
        fieldsMap,
        dashboardTiles,
        sqlColumnsByTile,
    ]);
};

// "Add a field": the shipped field picker over the fitting fields on tiles not
// yet filtered. Picking one filters only those tiles, selects its chip and
// leaves Undo on the bar
const AddFieldMenu: FC<{
    rule: DashboardFilterRule;
    onPicked: (fieldId: string) => void;
}> = ({ rule, onPicked }) => {
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const [isOpen, setIsOpen] = useState(false);
    const applyWithUndo = useControlsSidebarSelector((c) => c.applyWithUndo);
    const setHighlightedFieldId = useControlsSidebarSelector(
        (c) => c.setHighlightedFieldId,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const fieldsMap = useFilterFieldsMap();
    const addable = useAddableFields(rule);
    const hasAddable = addable.length > 0;

    const pick = (field: DashboardFilterableField) => {
        const fieldId = getItemId(field);
        const rowKey = getDashboardFilterableFieldKey(field);
        // Only the tiles that label the field as the picked one does
        const tiles = (dashboardTiles ?? []).filter((tile) =>
            isTileInRow(
                tile,
                { key: rowKey, fieldId },
                fieldsByTile,
                fieldsMap,
            ),
        );
        const tileCount = tiles.filter(
            (tile) =>
                getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) ===
                    null && doesTileOfferField(tile, fieldId, fieldsByTile),
        ).length;
        setIsOpen(false);
        // Selected first, so the write leaves its Undo on the bar
        setHighlightedFieldId(rowKey);
        applyWithUndo(
            applyFieldToUnfilteredTiles(
                rule,
                { fieldId, tableName: field.table },
                tiles,
                fieldsByTile,
                sqlColumnsByTile,
            ),
            {
                kind: 'add',
                fieldId: rowKey,
                tileCount,
                replaced: 0,
                acrossTabs: true,
            },
        );
        onPicked(rowKey);
    };

    return (
        <Tooltip
            fz="xs"
            label={getUiString('filters.rail.noOtherField')}
            disabled={hasAddable}
        >
            <Box>
                <Popover
                    opened={isOpen && hasAddable}
                    onChange={setIsOpen}
                    position="bottom-start"
                    offset={4}
                    width={300}
                    transitionProps={MENU_TRANSITION}
                    trapFocus
                    // Focus goes to the new chip, not back here
                    returnFocus={false}
                >
                    <Popover.Target>
                        <Button
                            size="xs"
                            variant="default"
                            radius="xs"
                            className={addFilterClasses.dashed}
                            {...addFieldMarker}
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            disabled={!hasAddable}
                            onClick={() => setIsOpen((open) => !open)}
                        >
                            {getUiString('filters.rail.addField')}
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown
                        p="xs"
                        data-controls-editor
                        className={editorClasses.menu}
                    >
                        <DropdownClass
                            className={
                                contractClasses?.addFilterDropdown ?? null
                            }
                        >
                            {/* Its list stays inside, so a pick there is not
                                a press outside this popover */}
                            <FilterFieldSelect
                                fields={addable}
                                availableTileFilters={
                                    fieldsByTile ?? NO_TILE_FIELDS
                                }
                                tiles={dashboardTiles ?? []}
                                tabs={dashboardTabs}
                                activeTabUuid={activeTabUuid}
                                selectedField={undefined}
                                withLabel={false}
                                placeholder={getUiString(
                                    'filters.rail.searchFields',
                                )}
                                defaultOpened
                                onChange={pick}
                            />
                        </DropdownClass>
                    </Popover.Dropdown>
                </Popover>
            </Box>
        </Tooltip>
    );
};

// "4 of 6 tiles": every tile that can take the filter. The tabs show their
// own counts while tiles are chosen
const useMappingSummary = (
    rule: DashboardFilterRule,
): { summary: string; widest: string } => {
    const getUiString = useUiStrings();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
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
        const format = (count: number) => {
            const tilesOf = formatTilesOf(getUiString, count, total);
            return `${tilesOf.count} ${tilesOf.noun}`;
        };
        return { summary: format(applied), widest: format(total) };
    }, [rule, dashboardTiles, fieldsByTile, sqlColumnsByTile, getUiString]);
};

// The filter as its pill on the bar shows it: the dashboard's rule (a
// viewer's own from the temporary filters), or a new filter not in effect
// until Apply, with the field resolved the same way
const useBarPill = (
    rule: DashboardFilterRule,
): {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | undefined;
} => {
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardTemporaryFilters();
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const metricsMap = useDashboardContext((c) => c.allFilterableMetricsMap);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    return useMemo(() => {
        const isMetricRule = metricsMap[rule.target.fieldId] !== undefined;
        const group = isMetricRule ? 'metrics' : 'dimensions';
        const barRule = [
            ...dashboardFilters[group],
            ...temporaryFilters[group],
        ].find((filter) => filter.id === rule.id) ?? {
            ...rule,
            disabled: true,
        };
        return {
            rule: barRule,
            field: getDashboardFilterField<DashboardFilterableField>(
                isMetricRule ? metricsMap : fieldsMap,
                barRule,
                fieldsByTile,
            ),
        };
    }, [
        rule,
        dashboardFilters,
        temporaryFilters,
        fieldsMap,
        metricsMap,
        fieldsByTile,
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
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const pill = useBarPill(rule);
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
    const applyBlockedReason = useApplyBlockedReason(rule);
    const { summary, widest } = useMappingSummary(rule);

    const chips = (fieldTileActions?.chips ?? []).map(({ key: fieldId }) => {
        const tiles = fieldTileActions?.forField(fieldId);
        return {
            fieldId,
            label: tiles?.label ?? fieldId,
            field: tiles?.field ?? null,
        };
    });
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
                    field={pill.field}
                    filterRule={pill.rule}
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
            {/* One sentence: "[pill] filters 4 of 6 tiles using [chips]" */}
            <Text fz="sm" className={classes.words}>
                {getUiString('filters.rail.mappingFilters')}
            </Text>
            <Text
                fz="sm"
                fw={600}
                className={classes.summary}
                data-reserve={widest}
                aria-live="polite"
            >
                <span>{summary}</span>
            </Text>
            <Text fz="sm" className={classes.words}>
                {getUiString('filters.rail.mappingUsing')}
            </Text>
            {chips.map(({ fieldId, label, field }) => {
                const isSelected = highlightedFieldId === fieldId;
                return (
                    <Button
                        key={fieldId}
                        size="xs"
                        variant="default"
                        radius="xs"
                        className={classes.chip}
                        leftSection={
                            field !== null && (
                                <FieldIcon item={field} size={14} aria-hidden />
                            )
                        }
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
    const contractClasses = useRailContractClasses();
    if (rule === null) return null;
    return (
        <Group
            // In the popover's place, so an embed's rail class goes with it
            className={
                contractClasses === null
                    ? classes.row
                    : `${classes.row} ${contractClasses.rail}`
            }
            gap="xs"
            tabIndex={-1}
            // The popover that held focus is gone: the row takes it, so Tab
            // reaches the chips and Escape cancels from here
            ref={focusOnMount}
            data-controls-editor
            {...mappingRowMarker}
            data-testid="controls-mapping-row"
        >
            <MappingRowContent rule={rule} />
        </Group>
    );
};
