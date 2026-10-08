import { type ParameterDefinitions } from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { useCallbackRef } from '@mantine/hooks';
import { memo, useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { LazySelect } from './LazySelect';
import {
    addControlKeyFromTile,
    getControlFreeParameterKeys,
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
import {
    getTileSelector,
    LOCKED_TILE_CLASS,
    WAVE_BUCKETS,
} from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';

// The select value that is not a parameter key
const ALL = '__all__';
const NO_KEYS: string[] = [];
const OWN_GROUP = 'In this control';
const OTHER_GROUP = 'Other parameters on this tile';
// Past this many entries the dropdown is searchable
const SEARCH_THRESHOLD = 8;

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
    // The control's parameters this tile uses
    keys: string[];
    // Parameters in no control that the tile uses and the control could take.
    // No keys and no candidates means only the veil
    candidates: string[];
    // Null: the control sets nothing on the tile
    selectValue: string | null;
    isSet: boolean;
    // One line per parameter the card reports on
    sourceLines: string[];
    parameterDefinitions: ParameterDefinitions;
    highlight: TileHighlight | null;
    // The clicked parameter, on the tiles set through it
    scrollFieldId: string | null;
    wave: number;
    onSelect: (tileUuid: string, value: string | null) => void;
};

const ParameterOverlay = memo<OverlayProps>(
    ({
        tileUuid,
        selectLabel,
        keys,
        candidates,
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

        if (keys.length === 0 && candidates.length === 0) {
            return (
                <div
                    className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
                    data-controls-overlay
                    data-wave={wave}
                    title="This control cannot reach this tile"
                />
            );
        }

        const toOption = (key: string) => ({
            value: key,
            label: getParameterLabel(key, parameterDefinitions),
        });
        const data = [
            ...(keys.length > 1
                ? [{ value: ALL, label: 'All its parameters' }]
                : []),
            ...keys.map(toOption),
        ];
        const groups = [
            { label: OWN_GROUP, items: data },
            { label: OTHER_GROUP, items: candidates.map(toOption) },
        ];

        return (
            <div
                ref={overlayRef}
                className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                data-controls-overlay
                title="Tiles are locked while a control is edited"
                data-highlighted={highlight ?? undefined}
                data-wave={wave}
            >
                <Box className={classes.ring} aria-hidden />
                <Paper
                    shadow="lg"
                    p="sm"
                    radius="md"
                    className={classes.card}
                    title=""
                    data-keeps-field
                >
                    <Box
                        key={selectValue ?? 'off'}
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
                            placeholder="Select a parameter"
                            clearLabel="Switch this tile off"
                            renderOptionIcon={null}
                            value={selectValue}
                            onChange={(value) => onSelect(tileUuid, value)}
                            groups={groups}
                            searchable={
                                candidates.length > 0 ||
                                data.length > SEARCH_THRESHOLD
                            }
                            nothingFoundMessage="No parameters match"
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
        true,
    );

    // One stable handler for every card: it reads the control as it is when called
    // A cleared select (null) switches the tile off
    const handleSelect = useCallbackRef(
        (tileUuid: string, value: string | null) => {
            const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
            if (editingControl === null || tile === undefined) return;
            // A parameter the control does not hold yet: it joins the control
            // on this tile only
            if (
                value !== null &&
                value !== ALL &&
                !editingControl.parameterKeys.includes(value)
            ) {
                updateControl(
                    addControlKeyFromTile(
                        editingControl,
                        value,
                        tileUuid,
                        tileParameterReferences,
                    ),
                );
                return;
            }
            const isSingle =
                getControlKeysOnTile(
                    editingControl,
                    tile,
                    tileParameterReferences,
                ).length === 1;
            const target: ControlTileTarget =
                value === null
                    ? false
                    : value === ALL || isSingle
                      ? null
                      : value;
            updateControl(
                setControlTileTarget(editingControl, tileUuid, target),
            );
        },
    );

    const freeKeys =
        editingControl === null
            ? NO_KEYS
            : getControlFreeParameterKeys(
                  editingControl,
                  parameterControls,
                  parameterDefinitions,
                  tileParameterReferences,
              );
    // Keyed on the free parameters, not the controls: an edit that keeps
    // them, or a hover, hands every tile the list it already had
    const freeKey = freeKeys.join('\n');
    const isEditing = editingControl !== null;
    const candidatesByTile = useMemo(() => {
        // No work per tile unless a parameter control is being edited
        if (!isEditing) return {};
        const free = new Set(freeKey === '' ? [] : freeKey.split('\n'));
        return Object.fromEntries(
            tiles.map((tile): [string, string[]] => [
                tile.uuid,
                [...new Set(tileParameterReferences[tile.uuid] ?? [])].filter(
                    (key) => free.has(key),
                ),
            ]),
        );
    }, [isEditing, freeKey, tiles, tileParameterReferences]);

    if (editingControl === null) return null;

    // An unlabelled control goes by its first parameter's name
    const [firstKey] = editingControl.parameterKeys;
    const controlName =
        editingControl.label.trim() ||
        (firstKey === undefined
            ? 'Parameter control'
            : getParameterLabel(firstKey, parameterDefinitions));
    const selectLabel = `${controlName} on this tile`;

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
                // Solid blue: set. Dashed blue: set, but not through the active
                // parameter. Dashed grey: not set, but could be
                const candidates = candidatesByTile[tile.uuid] ?? NO_KEYS;
                const highlight: TileHighlight | null =
                    keys.length === 0 && candidates.length === 0
                        ? null
                        : setKeys.length === 0
                          ? 'available'
                          : activeFieldId === null ||
                              setKeys.includes(activeFieldId)
                            ? 'mapped'
                            : 'other';
                const target = getControlTileTarget(editingControl, tile.uuid);
                const selectValue =
                    target === false || keys.length === 0
                        ? null
                        : target === null
                          ? keys.length === 1
                              ? keys[0]
                              : ALL
                          : // Narrowed to a parameter this tile does not use
                            keys.includes(target)
                            ? target
                            : null;
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
                        candidates={candidates}
                        selectValue={selectValue}
                        isSet={setKeys.length > 0}
                        sourceLines={sourceLines}
                        parameterDefinitions={parameterDefinitions}
                        highlight={highlight}
                        // Only a tile set through the clicked parameter, while
                        // it is the active one
                        scrollFieldId={
                            highlight === 'mapped' &&
                            activeFieldId !== null &&
                            activeFieldId === highlightedFieldId
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
