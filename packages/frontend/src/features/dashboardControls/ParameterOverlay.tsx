import { type ParameterDefinitions } from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { memo, useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { LazySelect } from './LazySelect';
import {
    getControlKeysOnTile,
    getControlKeysSetOnTile,
    getControlTileTarget,
    getParameterLabel,
    setControlTileTarget,
    type ControlTileTarget,
} from './parameterControls';
import {
    formatParameterValue,
    getTileParameterSource,
    type TileParameterSource,
} from './parameterSources';
import classes from './TileOverlay.module.css';
import { areTilePropsEqual, type TileHighlight } from './tileProps';
import { getTileSelector, stopPropagation, WAVE_BUCKETS } from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';

// Select values that are not parameter keys
const ALL = '__all__';
const OFF = '__off__';

const SOURCE_LABELS: Record<TileParameterSource['source'], string> = {
    dashboard: 'this control',
    chart: 'chart',
    default: 'default',
    none: 'needs a value',
};

const describeSource = ({ value, source }: TileParameterSource): string =>
    source === 'none'
        ? SOURCE_LABELS.none
        : `${formatParameterValue(value)} · ${SOURCE_LABELS[source]}`;

// Everything is a primitive, a stable reference or a list compared by item, so
// a card re-renders only when its own tile changes
type OverlayProps = {
    tileUuid: string;
    selectLabel: string;
    // The control's parameters this tile uses; none means only the veil
    keys: string[];
    selectValue: string;
    isSet: boolean;
    // One line per parameter the card reports on
    sourceLines: string[];
    parameterDefinitions: ParameterDefinitions;
    highlight: TileHighlight | null;
    // The clicked parameter, on the tiles it highlights
    scrollFieldId: string | null;
    wave: number;
    onSelect: (tileUuid: string, value: string) => void;
};

const ParameterOverlay = memo<OverlayProps>(
    ({
        tileUuid,
        selectLabel,
        keys,
        selectValue,
        isSet,
        sourceLines,
        parameterDefinitions,
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

        if (keys.length === 0) {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable}`}
                    data-wave={wave}
                    title="This control cannot reach this tile"
                    onMouseDown={stopPropagation}
                    onTouchStart={stopPropagation}
                    onClick={stopPropagation}
                />
            );
        }

        return (
            <div
                ref={overlayRef}
                className={classes.overlay}
                title="Tiles are locked while a control is edited"
                data-highlighted={highlight ?? undefined}
                data-wave={wave}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
            >
                <Box className={classes.ring} aria-hidden />
                <Paper
                    shadow="lg"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                >
                    <Box
                        key={selectValue}
                        className={classes.confirm}
                        aria-hidden
                    />
                    <Stack gap="xs">
                        <Text fz="xs" c="dimmed">
                            {isSet ? 'Set by' : 'Not set'}
                        </Text>
                        <LazySelect
                            aria-label={selectLabel}
                            leftSection={null}
                            value={selectValue}
                            onChange={(value) => onSelect(tileUuid, value)}
                            data={[
                                ...(keys.length === 1
                                    ? []
                                    : [
                                          {
                                              value: ALL,
                                              label: 'All its parameters',
                                          },
                                      ]),
                                ...keys.map((key) => ({
                                    value: key,
                                    label: getParameterLabel(
                                        key,
                                        parameterDefinitions,
                                    ),
                                })),
                                { value: OFF, label: 'Not set' },
                            ]}
                        />
                        {sourceLines.map((line, index) => (
                            <Text key={`${index}:${line}`} fz="xs" c="dimmed">
                                {line}
                            </Text>
                        ))}
                    </Stack>
                </Paper>
            </div>
        );
    },
    areTilePropsEqual,
);

export const ParameterOverlays: FC = () => {
    const editingControl = useControlsSidebarSelector((c) => c.editingControl);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const updateControl = useControlsSidebarSelector((c) => c.updateControl);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileChartSavedParameters = useDashboardContext(
        (c) => c.tileChartSavedParameters,
    );

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
        editingControl !== null,
    );

    // One stable handler for every card: it reads the control as it is when called
    const handleSelect = useCallbackRef((tileUuid: string, value: string) => {
        const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
        if (editingControl === null || tile === undefined) return;
        const isSingle =
            getControlKeysOnTile(editingControl, tile, tileParameterReferences)
                .length === 1;
        const target: ControlTileTarget =
            value === OFF ? false : value === ALL || isSingle ? null : value;
        updateControl(setControlTileTarget(editingControl, tileUuid, target));
    });

    if (editingControl === null) return null;

    const selectLabel = `${editingControl.label || 'New parameter control'} on this tile`;

    return (
        <>
            {tiles.map((tile, index) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const keys = getControlKeysOnTile(
                    editingControl,
                    tile,
                    tileParameterReferences,
                );
                const setKeys = getControlKeysSetOnTile(
                    editingControl,
                    tile,
                    tileParameterReferences,
                );
                const isMapped =
                    activeFieldId !== null && setKeys.includes(activeFieldId);
                // The tile uses the active parameter but this control does not set it there
                const isAvailable =
                    activeFieldId !== null &&
                    !isMapped &&
                    keys.includes(activeFieldId);
                // With no active parameter, every tile the control sets is marked
                const highlight: TileHighlight | null =
                    keys.length === 0
                        ? null
                        : isMapped
                          ? 'mapped'
                          : isAvailable
                            ? 'available'
                            : activeFieldId === null && setKeys.length > 0
                              ? 'reached'
                              : null;
                const target = getControlTileTarget(editingControl, tile.uuid);
                const selectValue =
                    target === false
                        ? OFF
                        : target === null
                          ? keys.length === 1
                              ? keys[0]
                              : ALL
                          : // Narrowed to a parameter this tile does not use
                            keys.includes(target)
                            ? target
                            : OFF;
                // The parameters the card reports on: the one the tile is narrowed to, else all it uses
                const shownKeys = setKeys.length > 0 ? setKeys : keys;
                const sourceLines = shownKeys.map(
                    (key) =>
                        `${shownKeys.length > 1 ? `${getParameterLabel(key, parameterDefinitions)}: ` : ''}${describeSource(
                            getTileParameterSource({
                                tileUuid: tile.uuid,
                                key,
                                parameterValues,
                                parameterControls,
                                tileChartSavedParameters,
                                parameterDefinitions,
                            }),
                        )}`,
                );
                return createPortal(
                    <ParameterOverlay
                        tileUuid={tile.uuid}
                        selectLabel={selectLabel}
                        keys={keys}
                        selectValue={selectValue}
                        isSet={setKeys.length > 0}
                        sourceLines={sourceLines}
                        parameterDefinitions={parameterDefinitions}
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
                    `parameters-${tile.uuid}`,
                );
            })}
        </>
    );
};
