import {
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { Box, Paper, Select, Stack, Text } from '@mantine/core';
import { useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
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
import { getTileSelector, stopPropagation, WAVE_BUCKETS } from './tileSelector';
import { useControlsSidebar } from './useControlsSidebar';
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

type OverlayProps = {
    tile: DashboardTile;
    control: DashboardParameterControl;
    activeFieldId: string | null;
    highlightedFieldId: string | null;
    wave: number;
    onChange: (control: DashboardParameterControl) => void;
};

const ParameterOverlay: FC<OverlayProps> = ({
    tile,
    control,
    activeFieldId,
    highlightedFieldId,
    wave,
    onChange,
}) => {
    const overlayRef = useRef<HTMLDivElement>(null);
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

    const keys = getControlKeysOnTile(control, tile, tileParameterReferences);
    const setKeys = getControlKeysSetOnTile(
        control,
        tile,
        tileParameterReferences,
    );
    const isMapped = activeFieldId !== null && setKeys.includes(activeFieldId);
    // The tile uses the active parameter but this control does not set it there
    const isAvailable =
        activeFieldId !== null && !isMapped && keys.includes(activeFieldId);
    const isHighlighted = isMapped || isAvailable;
    const highlight = isMapped
        ? 'mapped'
        : isAvailable
          ? 'available'
          : undefined;
    useScrollToHighlightedTile(overlayRef, highlightedFieldId, isHighlighted);

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

    const target = getControlTileTarget(control, tile.uuid);
    const isSingle = keys.length === 1;
    const getLabel = (key: string) =>
        getParameterLabel(key, parameterDefinitions);

    const getSelectValue = (): string => {
        if (target === false) return OFF;
        if (target === null) return isSingle ? keys[0] : ALL;
        // Narrowed to a parameter this tile does not use
        return keys.includes(target) ? target : OFF;
    };

    const toTarget = (value: string): ControlTileTarget => {
        if (value === OFF) return false;
        if (value === ALL || isSingle) return null;
        return value;
    };

    // The parameters the card reports on: the one the tile is narrowed to, else all it uses
    const shownKeys = setKeys.length > 0 ? setKeys : keys;

    return (
        <div
            ref={overlayRef}
            className={classes.overlay}
            title="Tiles are locked while a control is edited"
            data-highlighted={highlight}
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
                    key={getSelectValue()}
                    className={classes.confirm}
                    aria-hidden
                />
                <Stack gap="xs">
                    <Text fz="xs" c="dimmed">
                        {setKeys.length > 0 ? 'Set by' : 'Not set'}
                    </Text>
                    <Select
                        size="xs"
                        aria-label={`${control.label || 'New parameter control'} on this tile`}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        value={getSelectValue()}
                        onChange={(value) => {
                            if (value === null) return;
                            onChange(
                                setControlTileTarget(
                                    control,
                                    tile.uuid,
                                    toTarget(value),
                                ),
                            );
                        }}
                        data={[
                            ...(isSingle
                                ? []
                                : [
                                      {
                                          value: ALL,
                                          label: 'All its parameters',
                                      },
                                  ]),
                            ...keys.map((key) => ({
                                value: key,
                                label: getLabel(key),
                            })),
                            { value: OFF, label: 'Not set' },
                        ]}
                    />
                    {shownKeys.map((key) => (
                        <Text key={key} fz="xs" c="dimmed">
                            {shownKeys.length > 1 ? `${getLabel(key)}: ` : ''}
                            {describeSource(
                                getTileParameterSource({
                                    tileUuid: tile.uuid,
                                    key,
                                    parameterValues,
                                    parameterControls,
                                    tileChartSavedParameters,
                                    parameterDefinitions,
                                }),
                            )}
                        </Text>
                    ))}
                </Stack>
            </Paper>
        </div>
    );
};

export const ParameterOverlays: FC = () => {
    const { editingControl, activeFieldId, highlightedFieldId, updateControl } =
        useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);

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

    if (editingControl === null) return null;

    return (
        <>
            {tiles.map((tile, index) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                return createPortal(
                    <ParameterOverlay
                        tile={tile}
                        control={editingControl}
                        activeFieldId={activeFieldId}
                        highlightedFieldId={highlightedFieldId}
                        wave={index % WAVE_BUCKETS}
                        onChange={updateControl}
                    />,
                    element,
                    `parameters-${tile.uuid}`,
                );
            })}
        </>
    );
};
