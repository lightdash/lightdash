import {
    DashboardTileTypes,
    FeatureFlags,
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
    Paper,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import { memo, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getCandidateOptions,
    getTileFieldCandidateIds,
    getTileStarterFieldIds,
} from './fieldCandidates';
import { pluralizeTiles } from './fieldLabels';
import { LazySelect } from './LazySelect';
import {
    doesTileOfferField,
    getFilterFields,
    getMissingTileFieldId,
    getTileField,
    getTilesOnTab,
    canTileTakeFilter,
    isTargetOnRow,
    isTileFieldKnown,
    isTileOnFilter,
    setTileField,
    toSqlColumnTarget,
    type SqlColumn,
} from './peers';
import classes from './TileOverlay.module.css';
import {
    areTilePropsEqual,
    getTileTitle,
    type TileHighlight,
} from './tileProps';
import {
    getTileSelector,
    LOCKED_TILE_CLASS,
    WAVE_BUCKETS,
} from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFieldTileActions, type TileScope } from './useFieldTileActions';
import { useHoveredFilterRule } from './useHoveredFilterRule';
import { focusLabelInput } from './useLabelDraft';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NO_COLUMNS: SqlColumn[] = [];
const NO_FIELD_IDS: string[] = [];
// A tile card's select: the stand-in button, or the real input once used
const SELECT_SELECTOR = '[aria-haspopup="listbox"]';
const OWN_GROUP = 'In this filter';
const OTHER_GROUP = 'Other fields on this tile';
const STARTER_FIELDS_GROUP = 'Fields on this tile';
// What a data app tile's switch reports when it is turned on
const DATA_APP_ON = 'on';
// Past this many entries the dropdown is searchable
const SEARCH_THRESHOLD = 8;

type FieldsMap = Record<string, DashboardFilterableField>;

// The last change made from a tile card, which that card then offers for the
// rest of the tab. Whether it still applies is worked out on each render
type FollowUp = {
    ruleId: string;
    tabUuid: string | null;
    tileUuid: string;
    fieldId: string;
    isSqlColumn: boolean;
    kind: 'filter' | 'clear';
};

// The fields a new control can start from, by tile
const NO_STARTERS_BY_TILE: Record<string, string[]> = {};

const getFieldLabel = (fieldId: string, fieldsMap: FieldsMap): string =>
    fieldsMap[fieldId]?.label ?? fieldId;

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

// The shipped wording for a mapped field that is gone, on a tile
const MissingFieldWarning: FC<{ fieldId: string }> = ({ fieldId }) => {
    const getUiString = useUiStrings();
    const label = interpolateUiString(
        getUiString('filters.config.fieldNotAvailableInChart'),
        { field: fieldId },
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

// Everything is a primitive, a stable reference or a list compared by item, so
// a card re-renders only when its own tile changes
type TileOverlayProps = {
    tileUuid: string;
    selectLabel: string;
    // The control has no field yet: the card offers what it could start from
    isPlaceholder: boolean;
    // False: the control cannot reach the tile, which only gets the veil
    isReachable: boolean;
    isSqlTile: boolean;
    // A data app tile takes the filter as a whole: on or off, no field
    isDataAppTile: boolean;
    tileFieldId: string | null;
    // The tile is mapped to this field or column, which it no longer offers
    missingFieldId: string | null;
    options: string[];
    // Fields the tile offers that the filter could take, never on a SQL tile.
    // For a placeholder, every field the tile offers
    candidates: string[];
    fieldsMap: FieldsMap;
    highlight: TileHighlight | null;
    // The clicked field, on the tiles that are on it. Hover never changes it
    scrollFieldId: string | null;
    // Bucket for the arrival wave
    wave: number;
    // Offers the change just made here for the rest of the tab, or null
    followUpLabel: string | null;
    followUpName: string | null;
    onSelect: (tileUuid: string, value: string | null) => void;
    onFollowUp: () => void;
};

const TileOverlay = memo<TileOverlayProps>(
    ({
        tileUuid,
        selectLabel,
        isPlaceholder,
        isReachable,
        isSqlTile,
        isDataAppTile,
        tileFieldId,
        missingFieldId,
        options,
        candidates,
        fieldsMap,
        highlight,
        scrollFieldId,
        wave,
        followUpLabel,
        followUpName,
        onSelect,
        onFollowUp,
    }) => {
        const overlayRef = useRef<HTMLDivElement>(null);
        useScrollToHighlightedTile(
            overlayRef,
            scrollFieldId,
            scrollFieldId !== null,
        );
        // A tile the control cannot reach recedes, with nothing on top of it
        if (!isReachable) {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    data-highlighted={highlight ?? undefined}
                    data-wave={wave}
                    title="This tile has no field this filter can use"
                >
                    {/* Lit when a hovered rail row's filter is on the tile */}
                    <Box className={classes.ring} aria-hidden />
                </div>
            );
        }

        const usedField =
            tileFieldId !== null && !isSqlTile && missingFieldId === null
                ? fieldsMap[tileFieldId]
                : undefined;
        const ownOptions = options.map((fieldId) => ({
            value: fieldId,
            label: isSqlTile ? fieldId : getFieldLabel(fieldId, fieldsMap),
        }));
        const fieldOptions = getCandidateOptions(
            candidates,
            ownOptions.map((option) => option.label),
            fieldsMap,
        );
        // A new control lists the tile's fields as one plain list
        const firstGroup = isPlaceholder
            ? { label: STARTER_FIELDS_GROUP, items: fieldOptions }
            : { label: OWN_GROUP, items: ownOptions };
        const secondGroup = {
            label: OTHER_GROUP,
            items: isPlaceholder ? [] : fieldOptions,
        };

        return (
            <div
                ref={overlayRef}
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                data-highlighted={highlight ?? undefined}
                data-wave={wave}
                title="Tiles are locked while a filter is edited"
            >
                <Box className={classes.ring} aria-hidden />
                {/* An empty title keeps the veil's hint off the card */}
                <Paper
                    shadow="md"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                >
                    <Box
                        key={tileFieldId ?? 'none'}
                        className={classes.confirm}
                        aria-hidden
                    />
                    {isDataAppTile ? (
                        <Stack gap="xs">
                            <Text fz="xs" c="dimmed">
                                {tileFieldId !== null
                                    ? 'This tile is filtered'
                                    : 'This tile is not filtered'}
                            </Text>
                            <Switch
                                size="xs"
                                aria-label={selectLabel}
                                label="Filter this tile"
                                checked={tileFieldId !== null}
                                onChange={(event) =>
                                    onSelect(
                                        tileUuid,
                                        event.currentTarget.checked
                                            ? DATA_APP_ON
                                            : null,
                                    )
                                }
                            />
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            <Group gap="xxs" wrap="nowrap">
                                <Text fz="xs" c="dimmed">
                                    {missingFieldId !== null
                                        ? 'Filtered by a field this tile no longer has'
                                        : tileFieldId !== null
                                          ? 'This tile is filtered on'
                                          : 'This tile is not filtered'}
                                </Text>
                                {missingFieldId !== null && (
                                    <MissingFieldWarning
                                        fieldId={missingFieldId}
                                    />
                                )}
                            </Group>
                            <LazySelect
                                aria-label={selectLabel}
                                leftSection={
                                    usedField ? (
                                        <FieldIcon item={usedField} size={14} />
                                    ) : (
                                        <MantineIcon
                                            icon={IconFilter}
                                            size={14}
                                            color="dimmed"
                                        />
                                    )
                                }
                                placeholder={
                                    isSqlTile
                                        ? 'Select a column'
                                        : 'Select a field'
                                }
                                clearLabel="Stop filtering this tile"
                                fieldsMap={isSqlTile ? null : fieldsMap}
                                groups={[firstGroup, secondGroup]}
                                searchable={
                                    secondGroup.items.length > 0 ||
                                    firstGroup.items.length > SEARCH_THRESHOLD
                                }
                                nothingFoundMessage={
                                    isSqlTile
                                        ? 'No columns match'
                                        : 'No fields match'
                                }
                                value={tileFieldId}
                                onChange={(value) => onSelect(tileUuid, value)}
                            />
                            {followUpLabel !== null && (
                                <Box className={classes.followUp}>
                                    <Button
                                        variant="subtle"
                                        size="compact-xs"
                                        aria-label={followUpName ?? undefined}
                                        onClick={onFollowUp}
                                    >
                                        {followUpLabel}
                                    </Button>
                                </Box>
                            )}
                        </Stack>
                    )}
                </Paper>
            </div>
        );
    },
    areTilePropsEqual,
);

// Mounted while a control is edited, so what it remembers ends with the editor
export const TileOverlays: FC = () => {
    // A viewer changing a saved filter's value changes none of its tiles
    const isEditing = useControlsSidebarSelector(
        (c) => c.editingRule !== null && !c.isSavedValue,
    );
    return isEditing ? <EditedTileOverlays /> : <HoveredFilterReach />;
};

// Nothing is edited: the tiles on this tab that the hovered rail row's filter
// is on get the active field's ring, with no veil, card or lock. So do the
// tiles of a saved filter a viewer is changing the value of
const HoveredFilterReach: FC = () => {
    const savedValueRule = useControlsSidebarSelector((c) =>
        c.isSavedValue ? c.editingRule : null,
    );
    const hoveredRule = useHoveredFilterRule() ?? savedValueRule;
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(hoveredRule);
    const tileUuids = useMemo(() => {
        if (hoveredRule === null) return NO_FIELD_IDS;
        const all = dashboardTiles ?? [];
        const tiles =
            activeTab && dashboardTabs.length > 0
                ? getTilesOnTab(all, dashboardTabs, activeTab.uuid)
                : all;
        return tiles
            .filter((tile) =>
                isTileOnFilter(
                    hoveredRule,
                    tile,
                    fieldsByTile,
                    sqlColumnsByTile,
                ),
            )
            .map((tile) => tile.uuid);
    }, [
        hoveredRule,
        dashboardTiles,
        activeTab,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
    ]);
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        tileUuids.length > 0,
        false,
    );
    return (
        <>
            {tileUuids.map((tileUuid) => {
                const element = targets[tileUuid];
                if (!element) return null;
                return createPortal(
                    <Box className={classes.reach} aria-hidden>
                        <Box className={classes.ring} />
                    </Box>,
                    element,
                    tileUuid,
                );
            })}
        </>
    );
};

const EditedTileOverlays: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const clearHighlightedField = useControlsSidebarSelector(
        (c) => c.clearHighlightedField,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const addFirstFieldOnTile = useControlsSidebarSelector(
        (c) => c.addFirstFieldOnTile,
    );
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const dimensionsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const metricsMap = useDashboardContext((c) => c.allFilterableMetricsMap);
    // A tile reports metrics too, and a filter can be on a metric
    const fieldsMap = useMemo<FieldsMap>(
        () => ({ ...dimensionsMap, ...metricsMap }),
        [dimensionsMap, metricsMap],
    );
    // Creating a metric filter is gated like the shipped "Add filter"
    const metricFiltersFlag = useServerFeatureFlag(
        FeatureFlags.MetricDashboardFilters,
    );
    const canStartFromMetrics =
        metricFiltersFlag.data?.enabled ?? import.meta.env.DEV;
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    // A hovered rail row shows where its filter is, over the edited one's look
    const hoveredRule = useHoveredFilterRule();
    const hoveredSqlColumnsByTile = useSqlColumnsByTile(hoveredRule);
    const isActive = editingRule !== null;
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
    const [followUp, setFollowUp] = useState<FollowUp | null>(null);
    const activeTabUuid = activeTab?.uuid ?? null;

    // As the grid draws them: a tile with no tab, or a stale one, is on the
    // first tab
    const tiles = useMemo(() => {
        const all = dashboardTiles ?? [];
        return activeTab && dashboardTabs.length > 0
            ? getTilesOnTab(all, dashboardTabs, activeTab.uuid)
            : all;
    }, [dashboardTiles, dashboardTabs, activeTab]);
    const tileUuids = useMemo(() => tiles.map((tile) => tile.uuid), [tiles]);
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        isActive,
        true,
    );

    // One stable handler for every card: it reads the rule as it is when called
    // A cleared select (null) leaves the tile out
    const handleSelect = useCallbackRef(
        (tileUuid: string, value: string | null) => {
            const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
            if (editingRule === null || tile === undefined) return;
            // A new control started from a tile is on that tile only
            if (isPlaceholder) {
                if (value === null) return;
                const starter = fieldsByTile?.[tileUuid]?.find(
                    (candidate) => getItemId(candidate) === value,
                );
                if (starter !== undefined) {
                    addFirstFieldOnTile(starter, tileUuid);
                    // Naming it comes next
                    focusLabelInput();
                }
                return;
            }
            const isSqlTile =
                (sqlColumnsByTile[tileUuid] ?? NO_COLUMNS).length > 0;
            // Nothing is written while what the tile offers is not known
            if (!isTileFieldKnown(tile, fieldsByTile, sqlColumnsByTile)) return;
            const previousFieldId =
                getTileField(editingRule, tile, fieldsByTile, sqlColumnsByTile)
                    ?.fieldId ?? null;
            // The follow-up moves to the tile changed last; a data app tile
            // is on no field, so it gets none
            const followedFieldId = value ?? previousFieldId;
            setFollowUp(
                isDashboardDataAppTileType(tile) || followedFieldId === null
                    ? null
                    : {
                          ruleId: editingRule.id,
                          tabUuid: activeTabUuid,
                          tileUuid,
                          fieldId: followedFieldId,
                          isSqlColumn: isSqlTile,
                          kind: value === null ? 'clear' : 'filter',
                      },
            );
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
                const fieldTiles = fieldTileActions.forField(previousFieldId);
                if (fieldTiles.everyTabScope.applied === 1) {
                    if (highlightedFieldId === previousFieldId)
                        clearHighlightedField();
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
            updateFilter(
                setTileField(
                    editingRule,
                    tile,
                    field,
                    fieldsByTile,
                    sqlColumnsByTile,
                ),
            );
        },
    );

    // Another control, another tab or losing the last field ends it for good
    if (
        followUp !== null &&
        (isPlaceholder ||
            followUp.ruleId !== editingRule?.id ||
            followUp.tabUuid !== activeTabUuid)
    )
        setFollowUp(null);

    // The follow-up as it stands now: only for the control and tab it was made
    // on, while its tile is still as the change left it and other tiles remain
    const getShownFollowUp = () => {
        if (
            followUp === null ||
            editingRule === null ||
            isPlaceholder ||
            fieldTileActions === null ||
            followUp.ruleId !== editingRule.id ||
            followUp.tabUuid !== activeTabUuid
        )
            return null;
        const tile = tiles.find(
            (candidate) => candidate.uuid === followUp.tileUuid,
        );
        if (tile === undefined) return null;
        const tileFieldId =
            getTileField(editingRule, tile, fieldsByTile, sqlColumnsByTile)
                ?.fieldId ?? null;
        const isFilter = followUp.kind === 'filter';
        if (tileFieldId !== (isFilter ? followUp.fieldId : null)) return null;
        const fieldTiles = followUp.isSqlColumn
            ? fieldTileActions.forSqlColumn(followUp.fieldId)
            : fieldTileActions.forField(followUp.fieldId);
        const hasTabs = fieldTiles.thisTabScope !== null;
        const scope = fieldTiles.thisTabScope ?? fieldTiles.everyTabScope;
        // The other tiles of the scope that offer it and are not on it
        const count = isFilter
            ? scope.unfiltered + scope.replaced
            : scope.applied;
        // Not while the tiles' fields load: the count would be a guess
        if (count === 0 || !fieldTiles.canAct) return null;
        const tileScope: TileScope = hasTabs ? 'this-tab' : 'every-tab';
        // The card is on the tab, so only the name says which scope
        const where = hasTabs ? ' on this tab' : '';
        const others = `${count} ${pluralizeTiles(count)}${where}`;
        return {
            tileUuid: followUp.tileUuid,
            label: isFilter
                ? `Apply to the other ${count} too`
                : `Clear the other ${count} too`,
            name: isFilter
                ? `Apply ${fieldTiles.label} to the other ${others} too`
                : `Clear ${fieldTiles.label} from the other ${others} too`,
            run: () =>
                isFilter
                    ? fieldTiles.applyToAll(tileScope)
                    : fieldTiles.clear(tileScope),
        };
    };
    const shownFollowUp = getShownFollowUp();
    const handleFollowUp = useCallbackRef(() => {
        if (shownFollowUp === null) return;
        // The button leaves once used: its tile's select takes the focus
        targets[shownFollowUp.tileUuid]
            ?.querySelector<HTMLElement>(SELECT_SELECTOR)
            ?.focus();
        shownFollowUp.run();
        setFollowUp(null);
    });

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
    // Keyed on the filter's fields, not the rule: an edit that keeps them, or
    // a hover, hands every tile the list it already had
    const takenKey = filterFieldIds.join('\n');
    const candidatesByTile = useMemo(() => {
        if (targetField === undefined) return {};
        const takenFieldIds = takenKey === '' ? [] : takenKey.split('\n');
        return Object.fromEntries(
            tiles
                .filter(
                    (tile) => (sqlColumnsByTile[tile.uuid] ?? []).length === 0,
                )
                .map((tile): [string, string[]] => [
                    tile.uuid,
                    getTileFieldCandidateIds(
                        fieldsByTile?.[tile.uuid] ?? [],
                        takenFieldIds,
                        targetField,
                    ),
                ]),
        );
    }, [takenKey, targetField, tiles, fieldsByTile, sqlColumnsByTile]);

    // Keyed on the dashboard, not the placeholder: typing its label hands
    // every tile the lists it already had
    const startersByTile = useMemo(() => {
        if (!isPlaceholder) return NO_STARTERS_BY_TILE;
        return Object.fromEntries(
            tiles
                // A SQL chart tile has no explore fields to start from
                .filter((tile) => tile.type !== DashboardTileTypes.SQL_CHART)
                .map((tile): [string, string[]] => [
                    tile.uuid,
                    getTileStarterFieldIds(
                        fieldsByTile?.[tile.uuid] ?? [],
                        canStartFromMetrics,
                    ),
                ]),
        );
    }, [isPlaceholder, tiles, fieldsByTile, canStartFromMetrics]);

    if (editingRule === null) return null;

    if (isPlaceholder) {
        return (
            <>
                {tiles.map((tile, index) => {
                    const element = targets[tile.uuid];
                    if (!element) return null;
                    const starters = startersByTile[tile.uuid] ?? NO_FIELD_IDS;
                    const isReachable = starters.length > 0;
                    return createPortal(
                        <TileOverlay
                            tileUuid={tile.uuid}
                            // Not the label: typing it must not reach the tiles
                            selectLabel={`New filter on ${getTileTitle(tile)}`}
                            isPlaceholder
                            isReachable={isReachable}
                            isSqlTile={false}
                            isDataAppTile={false}
                            tileFieldId={null}
                            missingFieldId={null}
                            options={NO_FIELD_IDS}
                            candidates={starters}
                            fieldsMap={fieldsMap}
                            highlight={isReachable ? 'available' : null}
                            scrollFieldId={null}
                            wave={index % WAVE_BUCKETS}
                            followUpLabel={null}
                            followUpName={null}
                            onSelect={handleSelect}
                            onFollowUp={handleFollowUp}
                        />,
                        element,
                        tile.uuid,
                    );
                })}
            </>
        );
    }

    const filterLabel =
        editingRule.label ??
        (isSqlColumnFilter
            ? editingRule.target.fieldId
            : getFieldLabel(editingRule.target.fieldId, fieldsMap));
    return (
        <>
            {tiles.map((tile, index) => {
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
                const options = isSqlTile
                    ? sqlColumns.map((column) => column.reference)
                    : filterFieldIds.filter((fieldId) =>
                          doesTileOfferField(tile, fieldId, fieldsByTile),
                      );
                const candidates = candidatesByTile[tile.uuid] ?? NO_FIELD_IDS;
                // Reachable too: a tile that could add a field, a data app
                // tile, and a broken mapping, which has to stay clearable
                const isReachable =
                    canTileTakeFilter(tile, fieldsByTile, sqlColumnsByTile) &&
                    (isDataAppTile ||
                        missingFieldId !== null ||
                        options.length > 0 ||
                        candidates.length > 0);
                // filtered: no field active. mapped: on the active field.
                // other: filtered, not by the active field (a data app tile
                // that is on). available: could be filtered
                const isOnTheControl =
                    isReachable &&
                    tileFieldId !== null &&
                    missingFieldId === null;
                // A SQL column is never one of the filter's fields
                const isOnRow = (rowId: string | null) =>
                    rowId !== null &&
                    isOnTheControl &&
                    !isDataAppTile &&
                    isTargetOnRow(editingRule, tileTarget, rowId);
                const highlight: TileHighlight | null =
                    hoveredRule !== null
                        ? isTileOnFilter(
                              hoveredRule,
                              tile,
                              fieldsByTile,
                              hoveredSqlColumnsByTile,
                          )
                            ? 'mapped'
                            : null
                        : !isReachable
                          ? null
                          : !isOnTheControl
                            ? 'available'
                            : activeFieldId === null
                              ? 'filtered'
                              : isOnRow(activeFieldId)
                                ? 'mapped'
                                : 'other';
                return createPortal(
                    <TileOverlay
                        tileUuid={tile.uuid}
                        selectLabel={`${filterLabel} on ${getTileTitle(tile)}`}
                        isPlaceholder={false}
                        isReachable={isReachable}
                        isSqlTile={isSqlTile}
                        isDataAppTile={isDataAppTile}
                        tileFieldId={tileFieldId}
                        missingFieldId={missingFieldId}
                        options={options}
                        candidates={candidates}
                        fieldsMap={fieldsMap}
                        highlight={highlight}
                        // The clicked field, never the hovered one: leaving
                        // another row would scroll again
                        scrollFieldId={
                            isOnRow(highlightedFieldId)
                                ? highlightedFieldId
                                : null
                        }
                        wave={index % WAVE_BUCKETS}
                        followUpLabel={
                            shownFollowUp?.tileUuid === tile.uuid
                                ? shownFollowUp.label
                                : null
                        }
                        followUpName={
                            shownFollowUp?.tileUuid === tile.uuid
                                ? shownFollowUp.name
                                : null
                        }
                        onSelect={handleSelect}
                        onFollowUp={handleFollowUp}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
