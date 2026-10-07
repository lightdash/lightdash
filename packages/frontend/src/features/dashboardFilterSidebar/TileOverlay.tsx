import {
    getItemLabelWithoutTableName,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconFilter, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    doesTileOfferField,
    getDefaultTileField,
    getFilterFields,
    getTileField,
    isTileChanged,
    isTileFilterable,
    setTileField,
    type FieldsByTile,
} from './peers';
import classes from './TileOverlay.module.css';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';

const getTileSelector = (tileUuid: string) => `[data-tile-uuid="${tileUuid}"]`;

const NOT_FILTERED = '__not_filtered__';

type FieldsMap = Record<string, FilterableDimension>;

const getFieldLabel = (fieldId: string, fieldsMap: FieldsMap): string => {
    const field = fieldsMap[fieldId];
    return field ? getItemLabelWithoutTableName(field) : fieldId;
};

const getTileTitle = (tile: DashboardTile): string => {
    if (tile.properties.title) return tile.properties.title;
    if ('chartName' in tile.properties && tile.properties.chartName)
        return tile.properties.chartName;
    return 'this chart';
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

const stopPropagation = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

type TileOverlayProps = {
    tile: DashboardTile;
    rule: DashboardFilterRule;
    filterLabel: string;
    fieldsByTile: FieldsByTile;
    fieldsMap: FieldsMap;
    filterFieldIds: string[];
    offeredField: DashboardFieldTarget | null;
    highlightedFieldId: string | null;
    onChange: (rule: DashboardFilterRule) => void;
};

const TileOverlay: FC<TileOverlayProps> = ({
    tile,
    rule,
    filterLabel,
    fieldsByTile,
    fieldsMap,
    filterFieldIds,
    offeredField,
    highlightedFieldId,
    onChange,
}) => {
    const tileField = getTileField(rule, tile, fieldsByTile);
    const defaultField = getDefaultTileField(rule, tile, fieldsByTile);
    const isChanged = isTileChanged(rule, tile, fieldsByTile);
    const options = filterFieldIds.filter(
        (fieldId) =>
            doesTileOfferField(tile, fieldId, fieldsByTile) ||
            fieldId === tileField?.fieldId,
    );
    const isFilterable = isTileFilterable(tile, fieldsByTile);
    const showOffer =
        offeredField !== null &&
        offeredField.fieldId !== tileField?.fieldId &&
        doesTileOfferField(tile, offeredField.fieldId, fieldsByTile);
    const isHighlighted =
        showOffer ||
        (highlightedFieldId !== null &&
            tileField?.fieldId === highlightedFieldId);

    const setField = (field: DashboardFieldTarget | null) =>
        onChange(setTileField(rule, tile, field, fieldsByTile));

    if (!isFilterable) {
        return <div className={`${classes.overlay} ${classes.unfilterable}`} />;
    }

    if (options.length === 0) {
        return (
            <div className={classes.overlay}>
                <Text fz="xs" c="dimmed">
                    No matching field
                </Text>
            </div>
        );
    }

    const tileTitle = getTileTitle(tile);
    const usedField = tileField ? fieldsMap[tileField.fieldId] : undefined;

    return (
        <div
            className={classes.overlay}
            data-highlighted={isHighlighted || undefined}
        >
            <Paper
                shadow="md"
                p="sm"
                radius="md"
                className={classes.card}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
            >
                <Stack gap="xs">
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
                                label: getFieldLabel(fieldId, fieldsMap),
                            })),
                            { value: NOT_FILTERED, label: 'Not filtered' },
                        ]}
                        value={tileField?.fieldId ?? NOT_FILTERED}
                        onChange={(value) =>
                            setField(
                                value === null || value === NOT_FILTERED
                                    ? null
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
                            Use {getFieldLabel(offeredField.fieldId, fieldsMap)}
                        </Button>
                    ) : (
                        <Group justify="space-between">
                            {isChanged ? (
                                <Badge size="xs">Changed</Badge>
                            ) : (
                                <Text fz="xs" c="dimmed">
                                    Default
                                </Text>
                            )}
                            {isChanged && (
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    onClick={() => setField(defaultField)}
                                >
                                    Back to the default
                                </Button>
                            )}
                        </Group>
                    )}
                </Stack>
            </Paper>
        </div>
    );
};

export const TileOverlays: FC = () => {
    const {
        editingRule,
        waitingField,
        highlightedFieldId,
        listedFieldIds,
        updateFilter,
    } = useFilterSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);

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
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        editingRule !== null,
    );

    if (editingRule === null) return null;

    const filterLabel =
        editingRule.label ??
        getFieldLabel(editingRule.target.fieldId, fieldsMap);
    const filterFieldIds = getFilterFields(editingRule, listedFieldIds);
    const offeredField =
        waitingField ??
        (highlightedFieldId !== null
            ? getFieldTarget(highlightedFieldId, editingRule, fieldsMap)
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
                        fieldsMap={fieldsMap}
                        filterFieldIds={filterFieldIds}
                        offeredField={offeredField}
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
