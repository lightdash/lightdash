import { interpolateUiString } from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { IconClock } from '@tabler/icons-react';
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
import { type DateZoomTileCard, type ZoomTileChange } from './dateZoomControls';
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
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';
import { usePortalTargets } from './usePortalTargets';

const NO_STRINGS: string[] = [];

// Primitives and lists of primitives only, so a card re-renders for its own tile
type Props = {
    tileUuid: string;
    selectLabel: string;
    cardKind: DateZoomTileCard['kind'];
    fieldIds: string[];
    fieldLabels: string[];
    fieldTables: string[];
    /** Its field in this zoom; null: in it through the parameter; undefined: not in it. */
    fieldId: string | null | undefined;
    takenByName: string | null;
    /** Moving it would leave the other zoom with no tile. */
    isTakenLast: boolean;
    highlight: TileHighlight | null;
    onSet: (change: ZoomTileChange) => void;
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
        selectLabel,
        cardKind,
        fieldIds,
        fieldLabels,
        fieldTables,
        fieldId,
        takenByName,
        isTakenLast,
        highlight,
        onSet,
    }) => {
        const getUiString = useUiStrings();
        // A pick on a tile another zoom has: asked before it moves
        const [pendingMove, setPendingMove] = useState<ZoomTileChange | null>(
            null,
        );

        if (cardKind === 'none') {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    title={getUiString('controls.dateZoom.noDateField')}
                />
            );
        }

        const pick = (change: ZoomTileChange) => {
            if (change.target !== null && takenByName !== null)
                setPendingMove(change);
            else onSet(change);
        };
        const answer = (isMove: boolean) => {
            if (isMove && pendingMove !== null) onSet(pendingMove);
            setPendingMove(null);
        };
        const fieldTarget = (id: string | null): ZoomTileChange => {
            if (id === null) return { tileUuid, target: null };
            const index = fieldIds.indexOf(id);
            return {
                tileUuid,
                target: { fieldId: id, tableName: fieldTables[index] ?? null },
            };
        };
        const isInZoom = fieldId !== undefined;

        return (
            <div
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                data-highlighted={highlight ?? undefined}
                title={getUiString('controls.dateZoom.tilesLocked')}
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
                                {isTakenLast &&
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
                    ) : (
                        <Stack gap="xs">
                            {takenByName !== null && (
                                <Text fz="xs" c="dimmed" truncate>
                                    {interpolateUiString(
                                        getUiString('controls.dateZoom.inZoom'),
                                        { zoom: takenByName },
                                    )}
                                </Text>
                            )}
                            {cardKind === 'param' ? (
                                <Switch
                                    size="xs"
                                    label={getUiString(
                                        'controls.dateZoom.usesParameter',
                                    )}
                                    aria-label={selectLabel}
                                    checked={isInZoom}
                                    onChange={({ currentTarget }) =>
                                        pick({
                                            tileUuid,
                                            target: currentTarget.checked
                                                ? {
                                                      fieldId: null,
                                                      tableName: null,
                                                  }
                                                : null,
                                        })
                                    }
                                />
                            ) : (
                                <LazyFieldSelect
                                    selectLabel={selectLabel}
                                    fieldIds={fieldIds}
                                    fieldLabels={fieldLabels}
                                    value={fieldId ?? null}
                                    onChange={(id) => pick(fieldTarget(id))}
                                />
                            )}
                        </Stack>
                    )}
                </Paper>
            </div>
        );
    },
    areTilePropsEqual,
);

const LazyFieldSelect: FC<{
    selectLabel: string;
    fieldIds: string[];
    fieldLabels: string[];
    value: string | null;
    onChange: (fieldId: string | null) => void;
}> = ({ selectLabel, fieldIds, fieldLabels, value, onChange }) => {
    const getUiString = useUiStrings();
    const options = useMemo(
        () =>
            fieldIds.map((id, index) => ({
                value: id,
                label: fieldLabels[index] ?? id,
                disabled: false,
            })),
        [fieldIds, fieldLabels],
    );
    return (
        <LazySelect
            aria-label={selectLabel}
            leftSection={
                <MantineIcon icon={IconClock} size={14} color="dimmed" />
            }
            placeholder={getUiString('controls.dateZoom.dateField')}
            clearLabel={getUiString('controls.dateZoom.stopZooming')}
            options={{ kind: 'options', options }}
            nothingFoundMessage={getUiString('filters.tileCard.noFieldsMatch')}
            value={value}
            onChange={onChange}
        />
    );
};

// Mounted only while a date zoom's tiles are chosen
export const DateZoomTileOverlays: FC = () => {
    const isMapping = useDateZoomEditorSelector((c) => c.isMapping);
    return isMapping ? <MappedTileOverlays /> : null;
};

const MappedTileOverlays: FC = () => {
    const getUiString = useUiStrings();
    const mapping = useDateZoomMapping();
    const setTiles = useDateZoomEditorSelector((c) => c.setTiles);
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
    const handleSet = useCallbackRef((change: ZoomTileChange) =>
        setTiles([change], change.target === null ? 'clear' : 'pick'),
    );
    if (mapping === null) return null;

    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                const card = mapping.cardByTile[tile.uuid];
                if (!element || card === undefined) return null;
                const isField = card.kind !== 'none';
                const fieldId = isField ? card.fieldId : undefined;
                return createPortal(
                    <DateZoomTileOverlay
                        tileUuid={tile.uuid}
                        selectLabel={interpolateUiString(
                            getUiString('filters.tileCard.selectName'),
                            {
                                filter: mapping.name,
                                tile: getTileTitle(
                                    tile,
                                    getUiString('filters.tileCard.thisTile'),
                                ),
                            },
                        )}
                        cardKind={card.kind}
                        fieldIds={isField ? card.fieldIds : NO_STRINGS}
                        fieldLabels={isField ? card.fieldLabels : NO_STRINGS}
                        fieldTables={isField ? card.fieldTables : NO_STRINGS}
                        fieldId={fieldId}
                        takenByName={
                            isField ? (card.takenBy?.name ?? null) : null
                        }
                        isTakenLast={isField && card.takenBy?.isLast === true}
                        highlight={
                            !isField
                                ? null
                                : fieldId !== undefined
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
