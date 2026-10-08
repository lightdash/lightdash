import {
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconFilter } from '@tabler/icons-react';
import { memo, useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { LazySelect } from './LazySelect';
import {
    doesTileOfferField,
    getFilterFields,
    getTileField,
    isTileFilterable,
    setTileField,
    toSqlColumnTarget,
    type SqlColumn,
} from './peers';
import classes from './TileOverlay.module.css';
import { areTilePropsEqual, type TileHighlight } from './tileProps';
import { getTileSelector, stopPropagation, WAVE_BUCKETS } from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NOT_FILTERED = '__not_filtered__';
const NO_COLUMNS: SqlColumn[] = [];

type FieldsMap = Record<string, FilterableDimension>;

const getFieldLabel = (fieldId: string, fieldsMap: FieldsMap): string => {
    const field = fieldsMap[fieldId];
    return field
        ? getFieldDisplayLabel(field, Object.values(fieldsMap))
        : fieldId;
};

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

// Everything is a primitive, a stable reference or a list compared by item, so
// a card re-renders only when its own tile changes
type TileOverlayProps = {
    tileUuid: string;
    selectLabel: string;
    // False: the filter cannot reach the tile, which only gets the veil
    isReachable: boolean;
    isSqlTile: boolean;
    tileFieldId: string | null;
    options: string[];
    fieldsMap: FieldsMap;
    highlight: TileHighlight | null;
    // The clicked field, on the tiles it highlights
    scrollFieldId: string | null;
    // Bucket for the arrival wave
    wave: number;
    onSelect: (tileUuid: string, value: string) => void;
};

const TileOverlay = memo<TileOverlayProps>(
    ({
        tileUuid,
        selectLabel,
        isReachable,
        isSqlTile,
        tileFieldId,
        options,
        fieldsMap,
        highlight,
        scrollFieldId,
        wave,
        onSelect,
    }) => {
        const overlayRef = useRef<HTMLDivElement>(null);
        useScrollToHighlightedTile(
            overlayRef,
            scrollFieldId,
            scrollFieldId !== null,
        );

        // A tile the filter cannot reach recedes, with nothing on top of it
        if (!isReachable) {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable}`}
                    data-wave={wave}
                    title="This filter cannot reach this tile"
                    onMouseDown={stopPropagation}
                    onTouchStart={stopPropagation}
                    onClick={stopPropagation}
                />
            );
        }

        const usedField =
            tileFieldId !== null && !isSqlTile
                ? fieldsMap[tileFieldId]
                : undefined;

        return (
            <div
                ref={overlayRef}
                className={classes.overlay}
                data-highlighted={highlight ?? undefined}
                data-wave={wave}
                title="Tiles are locked while a control is edited"
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
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
                        key={tileFieldId ?? NOT_FILTERED}
                        className={classes.confirm}
                        aria-hidden
                    />
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            {tileFieldId !== null
                                ? 'Filtered by'
                                : 'Not filtered'}
                        </Text>
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
                            data={[
                                ...options.map((fieldId) => ({
                                    value: fieldId,
                                    label: isSqlTile
                                        ? fieldId
                                        : getFieldLabel(fieldId, fieldsMap),
                                })),
                                { value: NOT_FILTERED, label: 'Not filtered' },
                            ]}
                            value={tileFieldId ?? NOT_FILTERED}
                            onChange={(value) => onSelect(tileUuid, value)}
                        />
                    </Stack>
                </Paper>
            </div>
        );
    },
    areTilePropsEqual,
);

export const TileOverlays: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    // No field yet means nothing to place on a tile
    const isActive = editingRule !== null && !isPlaceholder;

    const tiles = useMemo(
        () =>
            (dashboardTiles ?? []).filter(
                (tile) =>
                    !activeTab ||
                    !tile.tabUuid ||
                    tile.tabUuid === activeTab.uuid,
            ),
        [dashboardTiles, activeTab],
    );
    const tileUuids = useMemo(() => tiles.map((tile) => tile.uuid), [tiles]);
    const targets = usePortalTargets(tileUuids, getTileSelector, isActive);

    // One stable handler for every card: it reads the rule as it is when called
    const handleSelect = useCallbackRef((tileUuid: string, value: string) => {
        const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
        if (editingRule === null || tile === undefined) return;
        const isSqlTile = (sqlColumnsByTile[tileUuid] ?? NO_COLUMNS).length > 0;
        const field =
            value === NOT_FILTERED
                ? null
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
    });

    if (editingRule === null || !isActive) return null;

    const filterLabel =
        editingRule.label ??
        getFieldLabel(editingRule.target.fieldId, fieldsMap);
    // A waiting field is offered on every tile that could take it
    const filterFieldIds = [
        ...getFilterFields(editingRule),
        ...waitingFieldIds,
    ];
    const offeredField =
        activeFieldId !== null
            ? getFieldTarget(activeFieldId, editingRule, fieldsMap)
            : null;

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
                const options = isSqlTile
                    ? sqlColumns.map((column) => column.reference)
                    : filterFieldIds.filter(
                          (fieldId) =>
                              doesTileOfferField(tile, fieldId, fieldsByTile) ||
                              fieldId === tileFieldId,
                      );
                const isReachable =
                    isTileFilterable(tile, fieldsByTile, sqlColumnsByTile) &&
                    options.length > 0;
                // The tile could take the active field; its select is where to switch
                const isAvailable =
                    offeredField !== null &&
                    offeredField.fieldId !== tileFieldId &&
                    doesTileOfferField(
                        tile,
                        offeredField.fieldId,
                        fieldsByTile,
                    );
                const isMapped =
                    activeFieldId !== null && tileFieldId === activeFieldId;
                // Solid ring: on the active field. Dashed: it could be. With
                // no active field, every tile the filter reaches is marked
                const highlight: TileHighlight | null = !isReachable
                    ? null
                    : isMapped
                      ? 'mapped'
                      : isAvailable
                        ? 'available'
                        : activeFieldId === null && tileFieldId !== null
                          ? 'reached'
                          : null;
                return createPortal(
                    <TileOverlay
                        tileUuid={tile.uuid}
                        selectLabel={`${filterLabel} on ${getTileTitle(tile)}`}
                        isReachable={isReachable}
                        isSqlTile={isSqlTile}
                        tileFieldId={tileFieldId}
                        options={options}
                        fieldsMap={fieldsMap}
                        highlight={highlight}
                        scrollFieldId={
                            highlight === 'mapped' || highlight === 'available'
                                ? highlightedFieldId
                                : null
                        }
                        wave={index % WAVE_BUCKETS}
                        onSelect={handleSelect}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
