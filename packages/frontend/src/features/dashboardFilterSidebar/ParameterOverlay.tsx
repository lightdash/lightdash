import { type DashboardTile } from '@lightdash/common';
import { Paper, Select, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    doesControlApplyToTile,
    type ParameterControl,
} from './parameterControls';
import {
    formatParameterValue,
    getParameterSources,
    getTileSelector,
    type TileParameterSource,
} from './parameterSources';
import classes from './TileOverlay.module.css';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';

const FOLLOWS = 'follows';
const SKIPS = 'skips';

const stopPropagation = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

type OverlayProps = {
    tile: DashboardTile;
    control: ParameterControl;
    referencedKeys: string[];
    sources: Record<string, TileParameterSource[]>;
    onChange: (tileTargets: ParameterControl['tileTargets']) => void;
};

const ParameterOverlay: FC<OverlayProps> = ({
    tile,
    control,
    referencedKeys,
    sources,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    if (referencedKeys.length === 0) {
        return <div className={`${classes.overlay} ${classes.unfilterable}`} />;
    }

    const applies = doesControlApplyToTile(
        control,
        tile,
        tileParameterReferences,
    );
    const [firstKey] = referencedKeys;
    const entry = sources[firstKey]?.find(
        (source) => source.tileUuid === tile.uuid,
    );
    const keyLabel = parameterDefinitions[firstKey]?.label ?? firstKey;
    const resolved =
        !entry || entry.source === 'none'
            ? `${keyLabel}: needs a value`
            : `${formatParameterValue(entry.value)} · ${getUiString(`parameters.source.${entry.source}`)}`;

    const setApplies = (value: string | null) => {
        const rest = Object.fromEntries(
            Object.entries(control.tileTargets).filter(
                ([tileUuid]) => tileUuid !== tile.uuid,
            ),
        );
        onChange(value === SKIPS ? { ...rest, [tile.uuid]: false } : rest);
    };

    return (
        <div className={classes.overlay}>
            <Paper
                shadow="md"
                p="sm"
                radius="md"
                className={classes.card}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
            >
                <Stack gap="xs">
                    <Text fz="xs" c="dimmed">
                        {applies ? 'Follows this control' : 'Does not apply'}
                    </Text>
                    <Select
                        size="xs"
                        aria-label={`${control.label} on this chart`}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        value={applies ? FOLLOWS : SKIPS}
                        onChange={setApplies}
                        data={[
                            { value: FOLLOWS, label: 'Follows this control' },
                            { value: SKIPS, label: 'Does not apply' },
                        ]}
                    />
                    <Text fz="xs" c="dimmed">
                        {resolved}
                    </Text>
                </Stack>
            </Paper>
        </div>
    );
};

export const ParameterOverlays: FC = () => {
    const { parameterControls, editingControlId, updateControl } =
        useFilterSidebar();
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
                        onChange={(tileTargets) =>
                            updateControl(control.id, { tileTargets })
                        }
                    />,
                    element,
                    `parameters-${tile.uuid}`,
                );
            })}
        </>
    );
};
