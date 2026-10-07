import {
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { Paper, Select, Stack, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import {
    doesTileOfferField,
    getFilterFields,
    getTileField,
    isTileFilterable,
    setTileField,
    toSqlColumnTarget,
    type SqlColumn,
    type FieldsByTile,
} from './peers';
import classes from './TileOverlay.module.css';
import { getTileSelector, stopPropagation } from './tileSelector';
import { useControlsSidebar } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const NOT_FILTERED = '__not_filtered__';

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

type TileOverlayProps = {
    tile: DashboardTile;
    rule: DashboardFilterRule;
    filterLabel: string;
    fieldsByTile: FieldsByTile;
    sqlColumns: SqlColumn[];
    fieldsMap: FieldsMap;
    filterFieldIds: string[];
    offeredField: DashboardFieldTarget | null;
    activeFieldId: string | null;
    highlightedFieldId: string | null;
    onChange: (rule: DashboardFilterRule) => void;
};

const TileOverlay: FC<TileOverlayProps> = ({
    tile,
    rule,
    filterLabel,
    fieldsByTile,
    sqlColumns,
    fieldsMap,
    filterFieldIds,
    offeredField,
    activeFieldId,
    highlightedFieldId,
    onChange,
}) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const sqlColumnsByTile = { [tile.uuid]: sqlColumns };
    const tileField = getTileField(rule, tile, fieldsByTile, sqlColumnsByTile);
    const isSqlTile = sqlColumns.length > 0;
    const options = isSqlTile
        ? sqlColumns.map((column) => column.reference)
        : filterFieldIds.filter(
              (fieldId) =>
                  doesTileOfferField(tile, fieldId, fieldsByTile) ||
                  fieldId === tileField?.fieldId,
          );
    const isFilterable = isTileFilterable(tile, fieldsByTile, sqlColumnsByTile);
    // The tile could take the active field; its select is where to switch
    const isAvailable =
        offeredField !== null &&
        offeredField.fieldId !== tileField?.fieldId &&
        doesTileOfferField(tile, offeredField.fieldId, fieldsByTile);
    const isMapped =
        activeFieldId !== null && tileField?.fieldId === activeFieldId;
    const isHighlighted = isMapped || isAvailable;
    // Solid ring: the tile is on the active field. Dashed: it could be
    const highlight = isMapped
        ? 'mapped'
        : isAvailable
          ? 'available'
          : undefined;
    useScrollToHighlightedTile(overlayRef, highlightedFieldId, isHighlighted);

    const setField = (field: DashboardFieldTarget | null) =>
        onChange(
            setTileField(rule, tile, field, fieldsByTile, sqlColumnsByTile),
        );

    // A tile the filter cannot reach recedes, with nothing on top of it
    if (!isFilterable || options.length === 0) {
        return (
            <div
                className={`${classes.overlay} ${classes.unfilterable}`}
                title="This filter cannot reach this tile"
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
            />
        );
    }

    const tileTitle = getTileTitle(tile);
    const usedField =
        tileField && !isSqlTile ? fieldsMap[tileField.fieldId] : undefined;

    return (
        <div
            ref={overlayRef}
            className={classes.overlay}
            data-highlighted={highlight}
            title="Tiles are locked while a control is edited"
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            onClick={stopPropagation}
        >
            {/* An empty title keeps the veil's hint off the card */}
            <Paper
                shadow="lg"
                p="sm"
                radius="md"
                className={classes.card}
                title=""
            >
                <Stack gap="xs">
                    <Text fz="xs" c="dimmed">
                        {tileField ? 'Filtered by' : 'Not filtered'}
                    </Text>
                    <Select
                        size="xs"
                        aria-label={`${filterLabel} on ${tileTitle}`}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
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
                        value={tileField?.fieldId ?? NOT_FILTERED}
                        onChange={(value) =>
                            setField(
                                value === null || value === NOT_FILTERED
                                    ? null
                                    : isSqlTile
                                      ? toSqlColumnTarget(value)
                                      : getFieldTarget(value, rule, fieldsMap),
                            )
                        }
                    />
                </Stack>
            </Paper>
        </div>
    );
};

export const TileOverlays: FC = () => {
    const {
        editingRule,
        activeFieldId,
        highlightedFieldId,
        updateFilter,
        isPlaceholder,
        waitingFieldIds,
    } = useControlsSidebar();
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
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                return createPortal(
                    <TileOverlay
                        tile={tile}
                        rule={editingRule}
                        filterLabel={filterLabel}
                        fieldsByTile={fieldsByTile}
                        sqlColumns={sqlColumnsByTile[tile.uuid] ?? []}
                        fieldsMap={fieldsMap}
                        filterFieldIds={filterFieldIds}
                        offeredField={offeredField}
                        activeFieldId={activeFieldId}
                        highlightedFieldId={highlightedFieldId}
                        onChange={updateFilter}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
