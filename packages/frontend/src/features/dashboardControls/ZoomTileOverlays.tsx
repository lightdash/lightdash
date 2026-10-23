import { assertUnreachable, type DateZoomConfig } from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconArrowRight, IconCalendar } from '@tabler/icons-react';
import { memo, useMemo, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTab,
    selectAvailableCustomGranularities,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { useEligibleZoomTiles } from '../dateZoom/hooks';
import { getGranularityLabel } from '../dateZoom/utils';
import { LazySelect } from './LazySelect';
import { getTilesOnTab } from './peers';
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
import { useHoveredZoomUuid } from './useHoveredZoomUuid';
import { usePortalTargets } from './usePortalTargets';
import { getZoomTileUuids, setZoomTileField } from './zoomState';

// chart: a date field to pick. param: on or off, no field (the tile reads the
// reserved date zoom parameter). other: in another zoom, read-only. none: no
// date to zoom, the veil only
export type ZoomTileKind = 'chart' | 'param' | 'other' | 'none';

const NO_OPTIONS: string[] = [];

// Primitives and short lists only, so a card re-renders only for its own tile
type ZoomTileOverlayProps = {
    tileUuid: string;
    kind: ZoomTileKind;
    selectLabel: string;
    // In this zoom: its field, or '' for a param-only tile; null when not
    fieldId: string | null;
    options: string[];
    optionLabels: string[];
    // The zoom the tile is in, for kind other
    otherName: string | null;
    otherDetail: string | null;
    // Moving the tile here leaves the other zoom with none
    isOtherEmptied: boolean;
    highlight: TileHighlight | null;
    wave: number;
    onSelect: (tileUuid: string, fieldId: string | null) => void;
    onToggle: (tileUuid: string, isOn: boolean) => void;
    onMove: (tileUuid: string) => void;
};

const ZoomTileOverlay = memo<ZoomTileOverlayProps>(
    ({
        tileUuid,
        kind,
        selectLabel,
        fieldId,
        options,
        optionLabels,
        otherName,
        otherDetail,
        isOtherEmptied,
        highlight,
        wave,
        onSelect,
        onToggle,
        onMove,
    }) => {
        const getUiString = useUiStrings();
        const isOn = fieldId !== null;
        const card = (body: ReactNode) => (
            <div
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                data-highlighted={highlight ?? undefined}
                data-wave={wave}
                title="Tiles are locked while a date zoom is edited"
            >
                <Box className={classes.ring} aria-hidden />
                <Paper
                    shadow="md"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                >
                    {body}
                </Paper>
            </div>
        );
        switch (kind) {
            case 'none':
                return (
                    <div
                        className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                        data-controls-overlay
                        data-highlighted={highlight ?? undefined}
                        data-wave={wave}
                        title="No date field to zoom"
                    >
                        <Box className={classes.ring} aria-hidden />
                    </div>
                );
            case 'other':
                return card(
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            Uses{' '}
                            <Text span fz="xs" fw={600}>
                                {otherName}
                            </Text>
                        </Text>
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                            <Text fz="sm" truncate>
                                {otherDetail}
                            </Text>
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                leftSection={
                                    <MantineIcon icon={IconArrowRight} />
                                }
                                onClick={() => onMove(tileUuid)}
                            >
                                Move here
                            </Button>
                        </Group>
                        {isOtherEmptied && (
                            <Text fz="xs" className={classes.removalWarning}>
                                {`${otherName} will be removed on save`}
                            </Text>
                        )}
                    </Stack>,
                );
            case 'param':
                return card(
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            {isOn
                                ? 'This tile is zoomed'
                                : 'This tile is not zoomed'}
                        </Text>
                        <Switch
                            size="xs"
                            aria-label={selectLabel}
                            label="Zoom this tile"
                            checked={isOn}
                            onChange={(event) =>
                                onToggle(tileUuid, event.currentTarget.checked)
                            }
                        />
                    </Stack>,
                );
            case 'chart':
                return card(
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            {isOn
                                ? 'This tile is zoomed on'
                                : 'This tile is not zoomed'}
                        </Text>
                        <LazySelect
                            aria-label={selectLabel}
                            leftSection={
                                <MantineIcon
                                    icon={IconCalendar}
                                    size={14}
                                    color="dimmed"
                                />
                            }
                            placeholder="Select a date field"
                            clearLabel="Stop zooming this tile"
                            fieldsMap={null}
                            groups={[
                                {
                                    label: '',
                                    items: options.map((value, index) => ({
                                        value,
                                        label: optionLabels[index] ?? value,
                                    })),
                                },
                            ]}
                            searchable={false}
                            nothingFoundMessage={getUiString(
                                'filters.tileCard.noFieldsMatch',
                            )}
                            value={fieldId}
                            onChange={(value) => onSelect(tileUuid, value)}
                        />
                    </Stack>,
                );
            default:
                return assertUnreachable(
                    kind,
                    `Unknown zoom tile kind: ${kind}`,
                );
        }
    },
    areTilePropsEqual,
);

// Every tile on the tab gets an overlay: a card on the tiles a zoom can reach,
// the veil on the rest. Mounted while a zoom is edited
export const ZoomTileOverlays: FC = () => {
    const getUiString = useUiStrings();
    const editingZoom = useControlsSidebarSelector((c) => c.editingZoom);
    const updateDateZoomConfig = useControlsSidebarSelector(
        (c) => c.updateDateZoomConfig,
    );
    const hoveredZoomUuid = useHoveredZoomUuid();
    const config = useDashboardDateZoomConfig();
    const controlUuid = editingZoom?.uuid ?? '';
    const eligibleTiles = useEligibleZoomTiles(config, controlUuid);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );

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
        editingZoom !== null,
        true,
    );
    const eligibleByUuid = useMemo(
        () => new Map(eligibleTiles.map((entry) => [entry.tile.uuid, entry])),
        [eligibleTiles],
    );

    // Stable for every card: reads the config as it is when called
    const write = useCallbackRef(
        (update: (next: DateZoomConfig) => DateZoomConfig) =>
            updateDateZoomConfig(update(config)),
    );
    const handleSelect = useCallbackRef(
        (tileUuid: string, fieldId: string | null) => {
            const field = eligibleByUuid
                .get(tileUuid)
                ?.zoomableFields.find((option) => option.fieldId === fieldId);
            write((next) =>
                setZoomTileField(
                    next,
                    controlUuid,
                    tileUuid,
                    field === undefined
                        ? null
                        : {
                              fieldId: field.fieldId,
                              tableName: field.tableName,
                          },
                ),
            );
        },
    );
    const handleToggle = useCallbackRef((tileUuid: string, isOn: boolean) =>
        write((next) =>
            setZoomTileField(
                next,
                controlUuid,
                tileUuid,
                isOn ? { fieldId: null, tableName: null } : null,
            ),
        ),
    );
    // Same tile, same field: only the zoom it is in changes
    const handleMove = useCallbackRef((tileUuid: string) =>
        write((next) => {
            const current = next.tileTargets[tileUuid];
            return current === undefined
                ? next
                : setZoomTileField(next, controlUuid, tileUuid, {
                      fieldId: current.fieldId,
                      tableName: current.tableName,
                  });
        }),
    );

    if (editingZoom === null) return null;
    const hoveredTiles =
        hoveredZoomUuid === null
            ? null
            : new Set(getZoomTileUuids(config, hoveredZoomUuid));

    return (
        <>
            {tiles.map((tile, index) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const entry = eligibleByUuid.get(tile.uuid);
                const target = config.tileTargets[tile.uuid];
                const isHere = target?.controlUuid === controlUuid;
                const other = entry?.conflictControl;
                const kind: ZoomTileKind =
                    entry === undefined
                        ? 'none'
                        : other !== undefined
                          ? 'other'
                          : entry.isParamOnly
                            ? 'param'
                            : 'chart';
                const otherField =
                    other === undefined || target === undefined
                        ? null
                        : target.fieldId === null
                          ? 'Parameter'
                          : (entry?.zoomableFields.find(
                                (field) => field.fieldId === target.fieldId,
                            )?.label ?? target.fieldId);
                const highlight: TileHighlight | null =
                    hoveredTiles !== null
                        ? hoveredTiles.has(tile.uuid)
                            ? 'mapped'
                            : null
                        : kind === 'none' || kind === 'other'
                          ? null
                          : isHere
                            ? 'filtered'
                            : 'available';
                return createPortal(
                    <ZoomTileOverlay
                        tileUuid={tile.uuid}
                        kind={kind}
                        selectLabel={`${editingZoom.name} on ${getTileTitle(
                            tile,
                            getUiString('filters.tileCard.thisTile'),
                        )}`}
                        fieldId={
                            isHere && target !== undefined
                                ? (target.fieldId ?? '')
                                : null
                        }
                        options={
                            entry?.zoomableFields.map(
                                (field) => field.fieldId,
                            ) ?? NO_OPTIONS
                        }
                        optionLabels={
                            entry?.zoomableFields.map((field) => field.label) ??
                            NO_OPTIONS
                        }
                        otherName={other?.name ?? null}
                        otherDetail={
                            other === undefined
                                ? null
                                : `${otherField} · ${getGranularityLabel(
                                      other.granularity,
                                      availableCustomGranularities,
                                      getUiString,
                                  )}`
                        }
                        isOtherEmptied={
                            other !== undefined &&
                            getZoomTileUuids(config, other.uuid).length === 1
                        }
                        highlight={highlight}
                        wave={index % WAVE_BUCKETS}
                        onSelect={handleSelect}
                        onToggle={handleToggle}
                        onMove={handleMove}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
