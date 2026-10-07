import { type DashboardTile } from '@lightdash/common';
import { Button, Paper, Select, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    doesTileReferenceKey,
    getControlTileKey,
    getParameterLabel,
    setControlTileKey,
    type ParameterControl,
} from './parameterControls';
import {
    formatParameterValue,
    getParameterSources,
    getTileSelector,
    type TileParameterSource,
} from './parameterSources';
import classes from './TileOverlay.module.css';
import { stopPropagation } from './tileSelector';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useScrollToHighlightedTile } from './useScrollToHighlightedTile';

const NOT_SET = 'not-set';

type OverlayProps = {
    tile: DashboardTile;
    control: ParameterControl;
    referencedKeys: string[];
    sources: Record<string, TileParameterSource[]>;
    activeFieldId: string | null;
    highlightedFieldId: string | null;
    onChange: (control: ParameterControl) => void;
};

const ParameterOverlay: FC<OverlayProps> = ({
    tile,
    control,
    referencedKeys,
    sources,
    activeFieldId,
    highlightedFieldId,
    onChange,
}) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const getUiString = useUiStrings();
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    const tileKey = getControlTileKey(control, tile, tileParameterReferences);
    const [firstKey] = referencedKeys;
    const entry = sources[tileKey ?? firstKey]?.find(
        (source) => source.tileUuid === tile.uuid,
    );
    const getLabel = (key: string) =>
        getParameterLabel(key, parameterDefinitions);
    const keyLabel = getLabel(tileKey ?? firstKey);
    const resolved =
        !entry || entry.source === 'none'
            ? `${keyLabel}: needs a value`
            : `${formatParameterValue(entry.value)} · ${getUiString(`parameters.source.${entry.source}`)}`;
    const offeredKey =
        activeFieldId !== null &&
        activeFieldId !== tileKey &&
        doesTileReferenceKey(tile, activeFieldId, tileParameterReferences)
            ? activeFieldId
            : null;
    const isHighlighted =
        offeredKey !== null ||
        (activeFieldId !== null && tileKey === activeFieldId);
    useScrollToHighlightedTile(overlayRef, highlightedFieldId, isHighlighted);

    if (referencedKeys.length === 0) {
        return (
            <div
                className={`${classes.overlay} ${classes.unfilterable}`}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={stopPropagation}
            >
                <Paper shadow="md" p="sm" radius="md" className={classes.card}>
                    <Text fz="xs" c="dimmed">
                        Not set by this control
                    </Text>
                    <Text fz="xs" c="dimmed">
                        This tile uses none of its parameters.
                    </Text>
                </Paper>
            </div>
        );
    }

    const setKey = (value: string | null) =>
        onChange(
            setControlTileKey(
                control,
                tile,
                value === NOT_SET ? null : value,
                tileParameterReferences,
            ),
        );

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
                        {tileKey ? 'Set by' : 'Not set'}
                    </Text>
                    <Select
                        size="xs"
                        aria-label={`${control.label} on this tile`}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        value={tileKey ?? NOT_SET}
                        onChange={setKey}
                        data={[
                            ...referencedKeys.map((key) => ({
                                value: key,
                                label: getLabel(key),
                            })),
                            { value: NOT_SET, label: 'Not set' },
                        ]}
                    />
                    <Text fz="xs" c="dimmed">
                        {resolved}
                    </Text>
                    {offeredKey !== null ? (
                        <Button
                            variant="light"
                            size="compact-xs"
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            onClick={() => setKey(offeredKey)}
                        >
                            {tileKey ? 'Switch to' : 'Use'}{' '}
                            {getLabel(offeredKey)}
                        </Button>
                    ) : null}
                </Stack>
            </Paper>
        </div>
    );
};

export const ParameterOverlays: FC = () => {
    const {
        parameterControls,
        editingControlId,
        activeFieldId,
        highlightedFieldId,
        updateControl,
    } = useFilterSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileChartSavedParameters = useDashboardContext(
        (c) => c.tileChartSavedParameters,
    );

    const control =
        parameterControls.find((c) => c.id === editingControlId) ?? null;

    const sources = useMemo(
        () =>
            getParameterSources({
                parameterValues,
                tileParameterReferences,
                tileChartSavedParameters,
                parameterDefinitions,
            }),
        [
            parameterValues,
            tileParameterReferences,
            tileChartSavedParameters,
            parameterDefinitions,
        ],
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
        control !== null,
    );

    if (control === null) return null;

    return (
        <>
            {tiles.map((tile) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                const referencedKeys = (
                    tileParameterReferences[tile.uuid] ?? []
                ).filter((key) => control.parameterKeys.includes(key));
                return createPortal(
                    <ParameterOverlay
                        tile={tile}
                        control={control}
                        referencedKeys={referencedKeys}
                        sources={sources}
                        activeFieldId={activeFieldId}
                        highlightedFieldId={highlightedFieldId}
                        onChange={(next) =>
                            updateControl(control.id, {
                                tileTargets: next.tileTargets,
                            })
                        }
                    />,
                    element,
                    `parameters-${tile.uuid}`,
                );
            })}
        </>
    );
};
