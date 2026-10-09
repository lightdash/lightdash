import {
    DashboardTileTypes,
    FeatureFlags,
    getItemId,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
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
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    getCandidateOptions,
    getTileFieldCandidateIds,
    getTileStarterFieldIds,
} from './fieldCandidates';
import { LazySelect } from './LazySelect';
import {
    doesTileOfferField,
    getFilterFields,
    getMissingTileFieldId,
    getTileField,
    getTilesOnTab,
    canTileTakeFilter,
    setTileField,
    toSqlColumnTarget,
    type SqlColumn,
} from './peers';
import classes from './TileOverlay.module.css';
import { areTilePropsEqual, type TileHighlight } from './tileProps';
import {
    getTileSelector,
    LOCKED_TILE_CLASS,
    WAVE_BUCKETS,
} from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFieldTileActions, type TileScope } from './useFieldTileActions';
import { focusLabelInput } from './useLabelDraft';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NO_COLUMNS: SqlColumn[] = [];
const NO_FIELD_IDS: string[] = [];
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

const getTileTitle = (tile: DashboardTile): string => {
    if (tile.properties.title) return tile.properties.title;
    if ('chartName' in tile.properties && tile.properties.chartName)
        return tile.properties.chartName;
    return 'this tile';
};

// Finds the target for a field id: a known field, else one already on the rule
const getFieldTarget = (
    fieldId: string,
    rule: DashboardFilterRule,
    fieldsMap: FieldsMap,
): DashboardFieldTarget | null => {
    const field = fieldsMap[fieldId];
    if (field) return { fieldId, tableName: field.table };
    if (rule.target.fieldId === fieldId) return rule.target;
    const fromTile = Object.values(rule.tileTargets ?? {}).find(
        (target): target is DashboardFieldTarget =>
            isDashboardFieldTarget(target) && target.fieldId === fieldId,
    );
    return fromTile ?? null;
};

// The shipped wording for a mapped field that is gone, on a tile
const MissingFieldWarning: FC<{ fieldId: string }> = ({ fieldId }) => {
    const label = `The selected field '${fieldId}' is not available in this tile`;
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
    // The clicked field, on the tiles that are on it
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
        // The same symbol as the sidebar: a field's type
        const renderOptionIcon = useCallback(
            (value: string) => {
                const field = fieldsMap[value];
                return field ? <FieldIcon item={field} size={14} /> : null;
            },
            [fieldsMap],
        );

        // A tile the control cannot reach recedes, with nothing on top of it
        if (!isReachable) {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    data-wave={wave}
                    title="This tile has no field this filter can use"
                />
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
                    shadow="lg"
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
                                    ? 'Filtered'
                                    : 'Not filtered'}
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
                                          ? 'Filtered by'
                                          : 'Not filtered'}
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
                                renderOptionIcon={
                                    isSqlTile ? null : renderOptionIcon
                                }
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
    const isEditing = useControlsSidebarSelector((c) => c.editingRule !== null);
    return isEditing ? <EditedTileOverlays /> : null;
};

const EditedTileOverlays: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const addFirstFieldOnTile = useControlsSidebarSelector(
        (c) => c.addFirstFieldOnTile,
    );
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
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
        const count = isFilter ? scope.unfiltered : scope.applied;
        if (count === 0) return null;
        const tileScope: TileScope = hasTabs ? 'this-tab' : 'every-tab';
        const where = hasTabs ? ' on this tab' : '';
        const label = `${isFilter ? 'Filter' : 'Clear'} the other ${count}${where} too`;
        return {
            tileUuid: followUp.tileUuid,
            label,
            // Starts with the visible label, then names the field
            name: isFilter
                ? `${label}, by ${fieldTiles.label}`
                : `${label}, from ${fieldTiles.label}`,
            run: () =>
                isFilter
                    ? fieldTiles.addToUnfiltered(tileScope)
                    : fieldTiles.clear(tileScope),
        };
    };
    const shownFollowUp = getShownFollowUp();
    const handleFollowUp = useCallbackRef(() => {
        if (shownFollowUp === null) return;
        shownFollowUp.run();
        setFollowUp(null);
    });

    // A waiting field is offered on every tile that could take it
    const filterFieldIds =
        editingRule === null
            ? NO_FIELD_IDS
            : [...getFilterFields(editingRule), ...waitingFieldIds];
    const targetField =
        editingRule === null
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
        getFieldLabel(editingRule.target.fieldId, fieldsMap);
    return (
        <>
            {tiles.map((tile, index) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const tileFieldId =
                    getTileField(
                        editingRule,
                        tile,
                        fieldsByTile,
                        sqlColumnsByTile,
                    )?.fieldId ?? null;
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
                // A tile with none of the filter's fields is still reachable
                // through a field it could add, a data app tile always is, and
                // a broken mapping has to stay clearable
                const isReachable =
                    canTileTakeFilter(tile, fieldsByTile, sqlColumnsByTile) &&
                    (isDataAppTile ||
                        missingFieldId !== null ||
                        options.length > 0 ||
                        candidates.length > 0);
                // Solid blue: filtered. Dashed blue: filtered, but not by the
                // active field. Dashed grey: not filtered, but could be. A data
                // app tile that is on is on no particular field
                const highlight: TileHighlight | null = !isReachable
                    ? null
                    : tileFieldId === null || missingFieldId !== null
                      ? 'available'
                      : activeFieldId === null ||
                          (!isDataAppTile && tileFieldId === activeFieldId)
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
                        // Only a tile on the clicked field, while it is the
                        // active one
                        scrollFieldId={
                            highlight === 'mapped' &&
                            activeFieldId !== null &&
                            activeFieldId === highlightedFieldId
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
