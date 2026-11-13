import {
    getItemId,
    interpolateUiString,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import {
    memo,
    useLayoutEffect,
    useMemo,
    useRef,
    type FC,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { getFieldSelectLabel } from '../../components/common/FieldSelect/fieldSelectLabel';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { getTileFieldOptions } from '../dashboardFilters/FilterConfiguration/utils';
import { useControlContractClasses } from './controlContractClasses';
import { DropdownClass } from './DropdownClass';
import { LazySelect } from './LazySelect';
import {
    doesTileOfferField,
    getFilterFields,
    getChipFieldId,
    getTileRowKey,
    getMissingTileFieldId,
    getTileField,
    canTileTakeFilter,
    isTargetOnRow,
    isTileInRow,
    isTileFieldKnown,
    setTileField,
    toSqlColumnTarget,
    type FieldsMap,
    type FilterChip,
    type SqlColumn,
} from './peers';
import { TileCard, TileVeil } from './TileCard';
import {
    areTilePropsEqual,
    getTileHighlight,
    type TileHighlight,
} from './tileProps';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFieldTileActions } from './useFieldTileActions';
import { useFilterFieldsMap } from './useFilterFieldsMap';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';
import { useTabTileTargets } from './useTabTileTargets';

const NO_COLUMNS: SqlColumn[] = [];
// A tile card's select: the stand-in button, or the real input once used
const SELECT_SELECTOR = '[aria-haspopup="listbox"]';
const NO_FIELD_IDS: string[] = [];
const NO_FIELDS: DashboardFilterableField[] = [];
const NO_CHIPS: FilterChip[] = [];
// What a data app tile's switch reports when it is turned on
const DATA_APP_ON = 'on';

const getFieldLabel = (fieldId: string, fieldsMap: FieldsMap): string =>
    fieldsMap[fieldId]?.label ?? fieldId;

// As the shipped tile select names a field: with its table
const getTileFieldLabel = (field: DashboardFilterableField): string =>
    getFieldSelectLabel(field, false);

// Finds the target for a field id: a known field, else one already on the rule
const getFieldTarget = (
    fieldId: string,
    rule: DashboardFilterRule,
    fieldsMap: FieldsMap,
): DashboardFieldTarget | null => {
    const field = fieldsMap[fieldId];
    if (field) return { fieldId, tableName: field.table };
    if (rule.target.fieldId === fieldId && !rule.target.isSqlColumn)
        return rule.target;
    const fromTile = Object.values(rule.tileTargets ?? {}).find(
        (target): target is DashboardFieldTarget =>
            isDashboardFieldTarget(target) &&
            !target.isSqlColumn &&
            target.fieldId === fieldId,
    );
    return fromTile ?? null;
};

// A mapped field that is gone from the tile, by its label when it is known
const MissingFieldWarning: FC<{ fieldLabel: string }> = ({ fieldLabel }) => {
    const getUiString = useUiStrings();
    const label = interpolateUiString(
        getUiString('filters.tileCard.fieldNotOnTile'),
        { field: fieldLabel },
    );
    return (
        <Tooltip fz="xs" label={label}>
            <Box role="img" aria-label={label} lh={0} flex="0 0 auto">
                <MantineIcon
                    icon={IconAlertTriangle}
                    size={14}
                    color="yellow.7"
                />
            </Box>
        </Tooltip>
    );
};

/** A tile card for a tile the control is not on: what it is, and the one action. */
export const TileCardOffRow: FC<{
    label: ReactNode;
    actionLabel: string;
    ariaLabel: string;
    onAction: () => void;
}> = ({ label, actionLabel, ariaLabel, onAction }) => (
    <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text fz="xs" c="dimmed">
            {label}
        </Text>
        <Button
            size="xs"
            variant="default"
            flex="0 0 auto"
            aria-label={ariaLabel}
            onClick={onAction}
        >
            {actionLabel}
        </Button>
    </Group>
);

// Everything is a primitive, a stable reference or a list compared by item, so
// a card re-renders only when its own tile changes
type TileOverlayProps = {
    tileUuid: string;
    selectLabel: string;
    // False: the control cannot reach the tile, which only gets the veil
    isReachable: boolean;
    isSqlTile: boolean;
    // A data app tile takes the filter as a whole: on or off, no field
    isDataAppTile: boolean;
    tileFieldId: string | null;
    // The field or column the tile is mapped to and no longer offers, by name
    missingFieldLabel: string | null;
    // What "Filter this tile" maps it to
    firstChoice: string | null;
    // The shipped tile select's options (`getTileFieldOptions`), from the
    // tile's own fields, so a field id two explores share reads as this
    // tile's explore names it. Empty on a SQL tile
    tileFields: DashboardFilterableField[];
    // A SQL tile's columns
    columns: string[];
    highlight: TileHighlight | null;
    // The clicked field, on the tiles that are on it. Hover never changes it
    scrollFieldId: string | null;
    // "Filtered by" its first field or "Filtered via" another, while filtered
    statusLabel: string | null;
    // `isPick`: a field chosen in the card's select, which selects its chip
    onSelect: (tileUuid: string, value: string | null, isPick: boolean) => void;
};

const TileOverlay = memo<TileOverlayProps>(
    ({
        tileUuid,
        selectLabel,
        isReachable,
        isSqlTile,
        isDataAppTile,
        tileFieldId,
        missingFieldLabel,
        firstChoice,
        tileFields,
        columns,
        highlight,
        scrollFieldId,
        statusLabel,
        onSelect,
    }) => {
        const overlayRef = useRef<HTMLDivElement>(null);
        const getUiString = useUiStrings();
        useScrollToHighlightedTile(
            overlayRef,
            scrollFieldId,
            scrollFieldId !== null,
        );
        // "Filter this tile" leaves with its card's state: its select takes focus
        const isSelectFocusPending = useRef(false);
        useLayoutEffect(() => {
            if (!isSelectFocusPending.current || tileFieldId === null) return;
            isSelectFocusPending.current = false;
            overlayRef.current
                ?.querySelector<HTMLElement>(SELECT_SELECTOR)
                ?.focus();
        }, [tileFieldId]);
        // A tile the control cannot reach recedes, with nothing on top of it
        if (!isReachable) {
            return (
                <TileVeil title={getUiString('filters.tileCard.unreachable')} />
            );
        }

        const usedField =
            tileFieldId === null || isSqlTile
                ? undefined
                : tileFields.find((field) => getItemId(field) === tileFieldId);
        // Full name when a long table name hides the field
        const fullLabel = usedField ? getTileFieldLabel(usedField) : null;

        return (
            <TileCard
                overlayRef={overlayRef}
                highlight={highlight}
                title={getUiString('filters.tileCard.locked')}
            >
                {isDataAppTile ? (
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            {getUiString(
                                tileFieldId !== null
                                    ? 'filters.tileCard.filtered'
                                    : 'filters.tileCard.notFiltered',
                            )}
                        </Text>
                        <Switch
                            size="xs"
                            aria-label={selectLabel}
                            label={getUiString(
                                'filters.tileCard.filterThisTile',
                            )}
                            checked={tileFieldId !== null}
                            onChange={(event) =>
                                onSelect(
                                    tileUuid,
                                    event.currentTarget.checked
                                        ? DATA_APP_ON
                                        : null,
                                    false,
                                )
                            }
                        />
                    </Stack>
                ) : tileFieldId === null ? (
                    // Onto the filter's field the tile has, else its first fitting one
                    <TileCardOffRow
                        label={getUiString('filters.tileCard.notFilteredLabel')}
                        actionLabel={getUiString(
                            'filters.tileCard.filterThisTile',
                        )}
                        ariaLabel={selectLabel}
                        onAction={() => {
                            isSelectFocusPending.current = true;
                            onSelect(tileUuid, firstChoice, false);
                        }}
                    />
                ) : (
                    <Stack gap="xs">
                        <Group gap="xxs" wrap="nowrap">
                            <Text fz="xs" c="dimmed" truncate>
                                {missingFieldLabel !== null
                                    ? getUiString(
                                          'filters.tileCard.missingField',
                                      )
                                    : statusLabel}
                            </Text>
                            {missingFieldLabel !== null && (
                                <MissingFieldWarning
                                    fieldLabel={missingFieldLabel}
                                />
                            )}
                        </Group>
                        <Tooltip
                            fz="xs"
                            label={fullLabel}
                            disabled={fullLabel === null}
                            position="bottom"
                        >
                            <Box>
                                <LazySelect
                                    aria-label={selectLabel}
                                    leftSection={
                                        usedField ? (
                                            <FieldIcon
                                                item={usedField}
                                                size={14}
                                            />
                                        ) : (
                                            <MantineIcon
                                                icon={IconFilter}
                                                size={14}
                                                color="dimmed"
                                            />
                                        )
                                    }
                                    placeholder={getUiString(
                                        isSqlTile
                                            ? 'filters.tileCard.selectColumn'
                                            : 'filters.tileCard.selectField',
                                    )}
                                    clearLabel={getUiString(
                                        'filters.tileCard.stopFiltering',
                                    )}
                                    options={
                                        isSqlTile
                                            ? { kind: 'columns', columns }
                                            : {
                                                  kind: 'fields',
                                                  fields: tileFields,
                                              }
                                    }
                                    nothingFoundMessage={getUiString(
                                        isSqlTile
                                            ? 'filters.tileCard.noColumnsMatch'
                                            : 'filters.tileCard.noFieldsMatch',
                                    )}
                                    value={tileFieldId}
                                    onChange={(value) =>
                                        onSelect(
                                            tileUuid,
                                            value,
                                            value !== null,
                                        )
                                    }
                                />
                            </Box>
                        </Tooltip>
                    </Stack>
                )}
            </TileCard>
        );
    },
    areTilePropsEqual,
);

// Mounted only while tiles are chosen: opening a filter leaves every tile as it is
export const TileOverlays: FC = () => {
    const isEditing = useControlsSidebarSelector((c) => c.isMapping);
    const contractClasses = useControlContractClasses();
    // The tile cards' lists, as an embed's stylesheet targets them
    return (
        <DropdownClass className={contractClasses?.filterDropdown ?? null}>
            {isEditing && <EditedTileOverlays />}
        </DropdownClass>
    );
};

const EditedTileOverlays: FC = () => {
    const getUiString = useUiStrings();
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const applyWithUndo = useControlsSidebarSelector((c) => c.applyWithUndo);
    const setHighlightedFieldId = useControlsSidebarSelector(
        (c) => c.setHighlightedFieldId,
    );
    const clearHighlightedField = useControlsSidebarSelector(
        (c) => c.clearHighlightedField,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useFilterFieldsMap();
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    const isActive = editingRule !== null;
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);

    const { tiles, targets, selectLabelOf } = useTabTileTargets(isActive);

    // One stable handler for every card: it reads the rule as it is when called
    // A cleared select (null) leaves the tile out
    const handleSelect = useCallbackRef(
        (tileUuid: string, value: string | null, isPick: boolean) => {
            const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
            if (editingRule === null || isPlaceholder || tile === undefined)
                return;
            const isSqlTile =
                (sqlColumnsByTile[tileUuid] ?? NO_COLUMNS).length > 0;
            // Nothing is written while what the tile offers is not known
            if (!isTileFieldKnown(tile, fieldsByTile, sqlColumnsByTile)) return;
            const previousFieldId =
                getTileField(editingRule, tile, fieldsByTile, sqlColumnsByTile)
                    ?.fieldId ?? null;
            // A field cleared from its last tile leaves the filter, unless it
            // is the filter's only field
            if (
                value === null &&
                previousFieldId !== null &&
                !isSqlTile &&
                !isDashboardDataAppTileType(tile) &&
                fieldTileActions !== null &&
                getFilterFields(editingRule, dashboardTiles).length > 1
            ) {
                const rowKey = getTileRowKey(
                    tile,
                    previousFieldId,
                    fieldsByTile,
                    fieldsMap,
                );
                const fieldTiles = fieldTileActions.forField(rowKey);
                if (fieldTiles.everyTabScope.applied === 1) {
                    if (highlightedFieldId === rowKey) clearHighlightedField();
                    fieldTiles.remove();
                    return;
                }
            }
            // A data app tile switched on follows the rule, as it does by
            // default
            const field =
                value === null
                    ? null
                    : isDashboardDataAppTileType(tile)
                      ? editingRule.target
                      : isSqlTile
                        ? toSqlColumnTarget(value)
                        : getFieldTarget(value, editingRule, fieldsMap);
            const next = setTileField(
                editingRule,
                tile,
                field,
                fieldsByTile,
                sqlColumnsByTile,
            );
            // A pick selects its chip first, so the write leaves its Undo on the bar
            if (isPick && value !== null) {
                const rowKey = isSqlTile
                    ? value
                    : getTileRowKey(tile, value, fieldsByTile, fieldsMap);
                setHighlightedFieldId(rowKey);
                applyWithUndo(next, {
                    kind: 'pick',
                    fieldId: rowKey,
                    tileCount: 1,
                    replaced: previousFieldId !== null ? 1 : 0,
                    acrossTabs: false,
                });
                return;
            }
            // The field bar's Undo takes back a card's write on its own field
            if (
                highlightedFieldId === null ||
                (value ?? previousFieldId) !==
                    getChipFieldId(
                        fieldTileActions?.chips ?? NO_CHIPS,
                        highlightedFieldId,
                        fieldsByTile,
                    )
            ) {
                updateFilter(next);
                return;
            }
            applyWithUndo(next, {
                kind: value === null ? 'clear' : 'apply',
                fieldId: highlightedFieldId,
                tileCount: 1,
                replaced: value !== null && previousFieldId !== null ? 1 : 0,
                acrossTabs: false,
            });
        },
    );

    // A waiting field is offered on every tile that could take it. A SQL
    // column filter has no field: its column is never looked up as one
    const isSqlColumnFilter = editingRule?.target.isSqlColumn === true;
    const filterFieldIds =
        editingRule === null || isSqlColumnFilter
            ? NO_FIELD_IDS
            : [
                  ...getFilterFields(editingRule, dashboardTiles),
                  ...waitingFieldIds,
              ];
    const targetField =
        editingRule === null || isSqlColumnFilter
            ? undefined
            : fieldsMap[editingRule.target.fieldId];
    // The shipped tile select's options for each tile, one stable list per
    // tile while the filter's field and the tiles' fields stay
    const tileFieldsByTile = useMemo(
        () =>
            Object.fromEntries(
                tiles.map((tile): [string, DashboardFilterableField[]] => [
                    tile.uuid,
                    targetField === undefined ||
                    (sqlColumnsByTile[tile.uuid] ?? []).length > 0
                        ? NO_FIELDS
                        : (getTileFieldOptions(
                              targetField,
                              fieldsByTile?.[tile.uuid],
                          ) ?? NO_FIELDS),
                ]),
            ),
        [targetField, tiles, fieldsByTile, sqlColumnsByTile],
    );

    // Nothing on the canvas until the filter has a field
    if (editingRule === null || isPlaceholder) return null;
    const chips = fieldTileActions?.chips ?? NO_CHIPS;

    const filterLabel =
        editingRule.label ??
        (isSqlColumnFilter
            ? editingRule.target.fieldId
            : getFieldLabel(editingRule.target.fieldId, fieldsMap));
    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const tileTarget = getTileField(
                    editingRule,
                    tile,
                    fieldsByTile,
                    sqlColumnsByTile,
                );
                const tileFieldId = tileTarget?.fieldId ?? null;
                const sqlColumns = sqlColumnsByTile[tile.uuid] ?? NO_COLUMNS;
                const isSqlTile = sqlColumns.length > 0;
                const isDataAppTile = isDashboardDataAppTileType(tile);
                const missingFieldId = getMissingTileFieldId(
                    editingRule,
                    tile,
                    fieldsByTile,
                    sqlColumnsByTile,
                );
                // A field the tile no longer offers is never an option: the
                // select reads empty and another field can be chosen
                const columns = sqlColumns.map((column) => column.reference);
                const tileFields = tileFieldsByTile[tile.uuid] ?? NO_FIELDS;
                // Onto the filter's field the tile has, else its first fitting one
                const firstChoice = isSqlTile
                    ? (columns[0] ?? null)
                    : (filterFieldIds.find((fieldId) =>
                          doesTileOfferField(tile, fieldId, fieldsByTile),
                      ) ?? (tileFields[0] ? getItemId(tileFields[0]) : null));
                const missingField =
                    missingFieldId === null || isSqlTile
                        ? undefined
                        : fieldsMap[missingFieldId];
                const missingFieldLabel =
                    missingFieldId === null
                        ? null
                        : missingField
                          ? getTileFieldLabel(missingField)
                          : missingFieldId;
                // Reachable too: a tile that could add a field, a data app
                // tile, and a broken mapping, which has to stay clearable
                const isReachable =
                    canTileTakeFilter(tile, fieldsByTile, sqlColumnsByTile) &&
                    (isDataAppTile ||
                        missingFieldId !== null ||
                        (isSqlTile ? columns : tileFields).length > 0);
                // filtered: no field active. mapped: on the active field.
                // other: filtered, not by the active field (a data app tile
                // that is on). available: could be filtered
                const isOnTheControl =
                    isReachable &&
                    tileFieldId !== null &&
                    missingFieldId === null;
                // A SQL column is never one of the filter's fields; a field's
                // chip is the label this tile gives it
                const isOnRow = (rowKey: string | null) => {
                    if (rowKey === null || !isOnTheControl || isDataAppTile)
                        return false;
                    const chip = {
                        key: rowKey,
                        fieldId: getChipFieldId(chips, rowKey, fieldsByTile),
                    };
                    return (
                        isTargetOnRow(editingRule, tileTarget, chip.fieldId) &&
                        (isSqlTile ||
                            isTileInRow(tile, chip, fieldsByTile, fieldsMap))
                    );
                };
                const tileField =
                    tileFieldId === null || isSqlTile
                        ? undefined
                        : fieldsByTile?.[tile.uuid]?.find(
                              (field) => getItemId(field) === tileFieldId,
                          );
                const tileFieldLabel =
                    tileFieldId === null || isSqlTile
                        ? tileFieldId
                        : tileField
                          ? getTileFieldLabel(tileField)
                          : getFieldLabel(tileFieldId, fieldsMap);
                const isFiltersOwnField =
                    tileFieldId === editingRule.target.fieldId;
                // The select below names the field once it lists it
                const isShownInSelect =
                    tileFieldId !== null &&
                    (isSqlTile
                        ? columns.includes(tileFieldId)
                        : tileFields.some(
                              (option) => getItemId(option) === tileFieldId,
                          ));
                const statusLabel =
                    tileFieldLabel === null || isDataAppTile
                        ? null
                        : isShownInSelect
                          ? getUiString(
                                isFiltersOwnField
                                    ? 'filters.tileCard.filteredByHeading'
                                    : 'filters.tileCard.filteredViaHeading',
                            )
                          : interpolateUiString(
                                getUiString(
                                    isFiltersOwnField
                                        ? 'filters.tileCard.filteredBy'
                                        : 'filters.tileCard.filteredVia',
                                ),
                                { field: tileFieldLabel },
                            );
                const highlight = getTileHighlight({
                    isReachable,
                    isOnControl: isOnTheControl,
                    activeId: activeFieldId,
                    isOnActive: isOnRow,
                });
                return createPortal(
                    <TileOverlay
                        tileUuid={tile.uuid}
                        selectLabel={selectLabelOf(filterLabel, tile)}
                        isReachable={isReachable}
                        isSqlTile={isSqlTile}
                        isDataAppTile={isDataAppTile}
                        tileFieldId={tileFieldId}
                        missingFieldLabel={missingFieldLabel}
                        firstChoice={firstChoice}
                        tileFields={tileFields}
                        columns={columns}
                        highlight={highlight}
                        // The clicked field, never the hovered one: leaving
                        // another row would scroll again
                        scrollFieldId={
                            isOnRow(highlightedFieldId)
                                ? highlightedFieldId
                                : null
                        }
                        statusLabel={statusLabel}
                        onSelect={handleSelect}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
