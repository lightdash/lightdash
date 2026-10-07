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
    Popover,
    Radio,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
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
    const isFilterable = isTileFilterable(tile, fieldsByTile);
    const canBeFiltered = isFilterable && options.length > 0;
    const showOffer =
        offeredField !== null &&
        offeredField.fieldId !== tileField?.fieldId &&
        doesTileOfferField(tile, offeredField.fieldId, fieldsByTile);
    const isHighlighted =
        showOffer ||
        (highlightedFieldId !== null &&
            tileField?.fieldId === highlightedFieldId);
    const isLookingForField =
        offeredField !== null || highlightedFieldId !== null;

    const setField = (field: DashboardFieldTarget | null) =>
        onChange(setTileField(rule, tile, field, fieldsByTile));

    if (!isFilterable) {
        return <div className={`${classes.overlay} ${classes.unfilterable}`} />;
    }

    const tileTitle = getTileTitle(tile);
    const chipLabel = tileField
        ? `Filtered by ${getFieldLabel(tileField.fieldId, fieldsMap)}`
        : 'Not filtered';

    return (
        <div
            className={`${classes.overlay} ${classes.filterable}`}
            data-highlighted={isHighlighted || undefined}
        >
            <Group gap="xxs" className={classes.chips} wrap="wrap">
                {canBeFiltered ? (
                    <Popover
                        opened={isMenuOpen}
                        onChange={setIsMenuOpen}
                        position="top-start"
                        withinPortal
                    >
                        <Popover.Target>
                            <Tooltip
                                label="Change which field this chart uses"
                                disabled={isMenuOpen}
                            >
                                <Button
                                    size="compact-xs"
                                    variant="default"
                                    className={
                                        tileField
                                            ? classes.chip
                                            : classes.chipDashed
                                    }
                                    rightSection={
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size={14}
                                            color="dimmed"
                                        />
                                    }
                                    aria-haspopup="menu"
                                    aria-expanded={isMenuOpen}
                                    aria-label={`${filterLabel} on ${tileTitle}`}
                                    onClick={() =>
                                        setIsMenuOpen((open) => !open)
                                    }
                                >
                                    {chipLabel}
                                </Button>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <Stack gap="xs">
                                <Text fz="sm" fw={600}>
                                    {filterLabel} on this chart
                                </Text>
                                <Radio.Group
                                    value={tileField?.fieldId ?? NOT_FILTERED}
                                    onChange={(value) =>
                                        setField(
                                            value === NOT_FILTERED
                                                ? null
                                                : getFieldTarget(
                                                      value,
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
                                        <Radio
                                            size="xs"
                                            value={NOT_FILTERED}
                                            label="Not filtered"
                                        />
                                    </Stack>
                                </Radio.Group>
                                <Group justify="space-between">
                                    {isChanged ? (
                                        <Button
                                            size="compact-xs"
                                            variant="subtle"
                                            onClick={() =>
                                                setField(defaultField)
                                            }
                                        >
                                            Back to the default
                                        </Button>
                                    ) : (
                                        <span />
                                    )}
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
                    isLookingForField &&
                    !showOffer && (
                        <Text className={classes.note} fz="xs">
                            No matching field
                        </Text>
                    )
                )}
                {isChanged && (
                    <Badge size="xs" className={classes.badge}>
                        Changed
                    </Badge>
                )}
                {showOffer && offeredField && (
                    <Tooltip
                        label={`Use ${getFieldLabel(
                            offeredField.fieldId,
                            fieldsMap,
                        )} on this chart`}
                    >
                        <Button
                            size="compact-xs"
                            variant="default"
                            className={classes.chipDashed}
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            aria-label={`${filterLabel} on ${tileTitle}`}
                            onClick={() => setField(offeredField)}
                        >
                            Use {getFieldLabel(offeredField.fieldId, fieldsMap)}
                        </Button>
                    </Tooltip>
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
