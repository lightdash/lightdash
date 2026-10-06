import {
    DashboardTileTypes,
    getItemLabelWithoutTableName,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Group,
    Popover,
    Radio,
    Stack,
    Text,
} from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
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

const TEXT_TILE_TYPES: DashboardTileTypes[] = [
    DashboardTileTypes.MARKDOWN,
    DashboardTileTypes.HEADING,
    DashboardTileTypes.LOOM,
];

type FieldsMap = Record<string, FilterableDimension>;

const getFieldLabel = (fieldId: string, fieldsMap: FieldsMap): string => {
    const field = fieldsMap[fieldId];
    return field ? getItemLabelWithoutTableName(field) : fieldId;
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const tileField = getTileField(rule, tile, fieldsByTile);
    const defaultField = getDefaultTileField(rule, tile, fieldsByTile);
    const isChanged = isTileChanged(rule, tile, fieldsByTile);
    const options = filterFieldIds.filter(
        (fieldId) =>
            doesTileOfferField(tile, fieldId, fieldsByTile) ||
            fieldId === tileField?.fieldId,
    );
    const canBeFiltered =
        isTileFilterable(tile, fieldsByTile) && options.length > 0;
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

    const fallbackField =
        defaultField ??
        (options[0] ? getFieldTarget(options[0], rule, fieldsMap) : null);

    return (
        <div
            className={classes.overlay}
            data-highlighted={isHighlighted || undefined}
        >
            <Group gap="xxs" className={classes.chips} wrap="wrap">
                {canBeFiltered ? (
                    <Popover
                        opened={isMenuOpen}
                        onChange={setIsMenuOpen}
                        position="top-start"
                        shadow="md"
                        withinPortal
                    >
                        <Popover.Target>
                            <Button
                                size="compact-xs"
                                radius="xl"
                                variant="default"
                                className={
                                    tileField
                                        ? classes.chip
                                        : classes.chipDashed
                                }
                                onClick={() => setIsMenuOpen((open) => !open)}
                            >
                                {filterLabel}:{' '}
                                {tileField
                                    ? getFieldLabel(
                                          tileField.fieldId,
                                          fieldsMap,
                                      )
                                    : 'not filtered'}
                            </Button>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <Stack gap="xs">
                                <Text fz="sm" fw={600}>
                                    {filterLabel} on this chart
                                </Text>
                                <Radio.Group
                                    value={tileField?.fieldId ?? ''}
                                    onChange={(fieldId) =>
                                        setField(
                                            getFieldTarget(
                                                fieldId,
                                                rule,
                                                fieldsMap,
                                            ),
                                        )
                                    }
                                >
                                    <Stack gap="xxs">
                                        {options.map((fieldId) => (
                                            <Radio
                                                key={fieldId}
                                                size="xs"
                                                value={fieldId}
                                                label={getFieldLabel(
                                                    fieldId,
                                                    fieldsMap,
                                                )}
                                            />
                                        ))}
                                    </Stack>
                                </Radio.Group>
                                {tileField ? (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="xs"
                                        ta="left"
                                        onClick={() => setField(null)}
                                    >
                                        Do not filter this chart
                                    </Anchor>
                                ) : (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="xs"
                                        ta="left"
                                        onClick={() => setField(fallbackField)}
                                    >
                                        Filter this chart
                                    </Anchor>
                                )}
                                {isChanged && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="xs"
                                        ta="left"
                                        onClick={() => setField(defaultField)}
                                    >
                                        Back to the default
                                    </Anchor>
                                )}
                                <Group justify="flex-end">
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        onClick={() => setIsMenuOpen(false)}
                                    >
                                        Done
                                    </Button>
                                </Group>
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                ) : (
                    <Text className={classes.note} fz="xs">
                        {TEXT_TILE_TYPES.includes(tile.type)
                            ? 'Text tiles cannot be filtered'
                            : 'No matching field'}
                    </Text>
                )}
                {isChanged && (
                    <Badge
                        size="xs"
                        variant="light"
                        color="orange"
                        className={classes.badge}
                    >
                        Changed
                    </Badge>
                )}
                {showOffer && offeredField && (
                    <Button
                        size="compact-xs"
                        radius="xl"
                        variant="default"
                        className={classes.chipDashed}
                        onClick={() => setField(offeredField)}
                    >
                        + {getFieldLabel(offeredField.fieldId, fieldsMap)}
                    </Button>
                )}
            </Group>
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
