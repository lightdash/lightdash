import {
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { Button, Paper, Select, Stack, Text } from '@mantine/core';
import { IconFilter, IconPlus } from '@tabler/icons-react';
import { useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { getTileSelector } from './parameterSources';
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
import { stopPropagation } from './tileSelector';
import { useFilterSidebar } from './useFilterSidebar';
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
    const showOffer =
        offeredField !== null &&
        offeredField.fieldId !== tileField?.fieldId &&
        doesTileOfferField(tile, offeredField.fieldId, fieldsByTile);
    const isHighlighted =
        showOffer ||
        (activeFieldId !== null && tileField?.fieldId === activeFieldId);
    useScrollToHighlightedTile(overlayRef, highlightedFieldId, isHighlighted);

    const setField = (field: DashboardFieldTarget | null) =>
        onChange(
            setTileField(rule, tile, field, fieldsByTile, sqlColumnsByTile),
        );

    if (!isFilterable) {
        return (
            <div
                className={`${classes.overlay} ${classes.unfilterable}`}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
            />
        );
    }

    if (options.length === 0) {
        return (
            <div
                className={classes.overlay}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
            >
                <Text fz="xs" c="dimmed">
                    No matching field
                </Text>
            </div>
        );
    }

    const tileTitle = getTileTitle(tile);
    const usedField =
        tileField && !isSqlTile ? fieldsMap[tileField.fieldId] : undefined;

    return (
        <div
            ref={overlayRef}
            className={classes.overlay}
            data-highlighted={isHighlighted || undefined}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            onClick={stopPropagation}
        >
            <Paper shadow="md" p="sm" radius="md" className={classes.card}>
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
                    {showOffer && offeredField ? (
                        <Button
                            variant="light"
                            size="compact-xs"
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            onClick={() => setField(offeredField)}
                        >
                            {tileField ? 'Switch to' : 'Use'}{' '}
                            {getFieldLabel(offeredField.fieldId, fieldsMap)}
                        </Button>
                    ) : null}
                </Stack>
            </Paper>
        </div>
    );
};

export const TileOverlays: FC = () => {
    const {
        editingRule,
        waitingField,
        activeFieldId,
        highlightedFieldId,
        listedFieldIds,
        updateFilter,
        isUnplaced,
    } = useFilterSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    // No field yet means nothing to place on a chart
    const isActive = editingRule !== null && !isUnplaced;

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
    const filterFieldIds = getFilterFields(editingRule, listedFieldIds);
    const offeredField =
        waitingField ??
        (activeFieldId !== null
            ? getFieldTarget(activeFieldId, editingRule, fieldsMap)
            : null);

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
