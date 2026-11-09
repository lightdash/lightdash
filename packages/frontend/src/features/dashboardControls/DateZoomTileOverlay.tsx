import { Box, Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconCalendar } from '@tabler/icons-react';
import { memo, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { LazySelect } from './LazySelect';
import { focusOnMount } from './mappingFocus';
import { getTilesOnTab } from './peers';
import classes from './TileOverlay.module.css';
import {
    areTilePropsEqual,
    getTileTitle,
    type TileHighlight,
} from './tileProps';
import { getTileSelector, LOCKED_TILE_CLASS } from './tileSelector';
import {
    useDateZoomEditorSelector,
    type DateZoomTileChoice,
} from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';
import { usePortalTargets } from './usePortalTargets';

const NO_FIELDS: string[] = [];

// Primitives and lists of primitives only, so a card re-renders for its own tile
type Props = {
    tileUuid: string;
    zoomName: string;
    tileTitle: string;
    cardKind: 'none' | 'fields' | 'parameter';
    fieldIds: string[];
    fieldLabels: string[];
    /** The field this zoom re-grains on the tile; null: not in this zoom. */
    fieldId: string | null;
    /** A tile that only reads the parameter: in this zoom or not. */
    isOn: boolean;
    /** The zoom holding the tile while this one does not. */
    takenByName: string | null;
    /** That zoom holds no other tile: a Move removes it. */
    isTakenByLastTile: boolean;
    highlight: TileHighlight | null;
    onSet: (tileUuid: string, choice: DateZoomTileChoice | null) => void;
};

// A zoom named inside a sentence: the one part that reads at full weight
const ZoomName: FC<{ name: string }> = ({ name }) => (
    <Text span inherit fw={600} c="text">
        {name}
    </Text>
);

const DateZoomTileOverlay = memo<Props>(
    ({
        tileUuid,
        zoomName,
        tileTitle,
        cardKind,
        fieldIds,
        fieldLabels,
        fieldId,
        isOn,
        takenByName,
        isTakenByLastTile,
        highlight,
        onSet,
    }) => {
        // A pick on a tile another zoom holds: asked before it moves
        const [pendingMove, setPendingMove] =
            useState<DateZoomTileChoice | null>(null);

        // As a parameter's unreachable tile: the veil only, the reason as its hint
        if (cardKind === 'none') {
            return (
                <Box
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    title="This tile has no date to zoom"
                />
            );
        }

        const pick = (choice: DateZoomTileChoice | null) => {
            if (choice !== null && takenByName !== null) {
                setPendingMove(choice);
                return;
            }
            onSet(tileUuid, choice);
        };
        const answer = (isMove: boolean) => {
            const choice = pendingMove;
            setPendingMove(null);
            if (isMove && choice !== null) onSet(tileUuid, choice);
        };
        const status =
            fieldId !== null || isOn ? (
                <>
                    Zoomed by <ZoomName name={zoomName} />
                </>
            ) : takenByName !== null ? (
                <>
                    Zoomed by <ZoomName name={takenByName} />
                </>
            ) : (
                'Not zoomed'
            );
        const label = `${zoomName} on ${tileTitle}`;

        return (
            <Box
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                data-highlighted={highlight ?? undefined}
                // Editors only map date zooms
                title="Tiles are locked while a date zoom is edited"
            >
                <Box className={classes.ring} aria-hidden />
                <Paper
                    shadow="md"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                    data-controls-editor
                >
                    {pendingMove !== null && takenByName !== null ? (
                        // The question on its own line: a long name has room
                        <Stack gap="xs">
                            <Text fz="xs" role="status">
                                Move from <ZoomName name={takenByName} />?
                                {isTakenByLastTile &&
                                    ' It has no other tiles and will be removed.'}
                            </Text>
                            <Group gap="xs" wrap="nowrap" justify="flex-end">
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => answer(false)}
                                >
                                    Cancel
                                </Button>
                                {/* The row's Apply is the one filled button */}
                                <Button
                                    variant="default"
                                    size="xs"
                                    ref={focusOnMount}
                                    onClick={() => answer(true)}
                                >
                                    Move
                                </Button>
                            </Group>
                        </Stack>
                    ) : cardKind === 'parameter' ? (
                        <Stack gap="xs">
                            <Text fz="xs" c="dimmed" truncate>
                                {status}
                            </Text>
                            <Switch
                                size="xs"
                                aria-label={label}
                                label="Zoom this tile"
                                checked={isOn}
                                onChange={(event) =>
                                    pick(
                                        event.currentTarget.checked
                                            ? { kind: 'parameter' }
                                            : null,
                                    )
                                }
                            />
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            <Text fz="xs" c="dimmed" truncate>
                                {status}
                            </Text>
                            <LazySelect
                                aria-label={label}
                                leftSection={
                                    <MantineIcon
                                        icon={IconCalendar}
                                        size={14}
                                        color="dimmed"
                                    />
                                }
                                placeholder="Select a date field"
                                clearLabel={`Stop zooming this tile by ${zoomName}`}
                                options={{
                                    kind: 'options',
                                    options: fieldIds.map((value, index) => ({
                                        value,
                                        label: fieldLabels[index],
                                        disabled: false,
                                    })),
                                }}
                                nothingFoundMessage="No date fields match"
                                value={fieldId}
                                onChange={(value) =>
                                    pick(
                                        value === null
                                            ? null
                                            : { kind: 'field', fieldId: value },
                                    )
                                }
                            />
                        </Stack>
                    )}
                </Paper>
            </Box>
        );
    },
    areTilePropsEqual,
);

// Mounted only while a date zoom's tiles are chosen
export const DateZoomTileOverlays: FC = () => {
    const isMapping = useDateZoomEditorSelector((c) => c.isMapping);
    return isMapping ? <MappedTileOverlays /> : null;
};

const MappedTileOverlays: FC = () => {
    const getUiString = useUiStrings();
    const mapping = useDateZoomMapping();
    const setTile = useDateZoomEditorSelector((c) => c.setTile);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    // As the grid draws them: a tile with no tab, or a stale one, is on the first
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
        mapping !== null,
        true,
    );
    const handleSet = useCallbackRef(
        (tileUuid: string, choice: DateZoomTileChoice | null) =>
            setTile(tileUuid, choice),
    );
    if (mapping === null) return null;

    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                const card = mapping.cardByTile[tile.uuid];
                if (!element || card === undefined) return null;
                const takenBy = card.kind === 'none' ? null : card.takenBy;
                const fieldId = card.kind === 'fields' ? card.fieldId : null;
                const isOn = card.kind === 'parameter' && card.isOn;
                return createPortal(
                    <DateZoomTileOverlay
                        tileUuid={tile.uuid}
                        zoomName={mapping.name}
                        tileTitle={getTileTitle(
                            tile,
                            getUiString('filters.tileCard.thisTile'),
                        )}
                        cardKind={card.kind}
                        fieldIds={
                            card.kind === 'fields'
                                ? card.fields.map((field) => field.fieldId)
                                : NO_FIELDS
                        }
                        fieldLabels={
                            card.kind === 'fields'
                                ? card.fields.map((field) => field.label)
                                : NO_FIELDS
                        }
                        fieldId={fieldId}
                        isOn={isOn}
                        takenByName={takenBy?.name ?? null}
                        isTakenByLastTile={
                            takenBy !== null &&
                            mapping.tileCountOf(takenBy.uuid) <= 1
                        }
                        highlight={
                            card.kind === 'none'
                                ? null
                                : fieldId !== null || isOn
                                  ? 'filtered'
                                  : 'available'
                        }
                        onSet={handleSet}
                    />,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
