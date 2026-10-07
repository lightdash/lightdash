import { Badge, Group } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    formatParameterValue,
    getParameterSources,
    getTileSelector,
} from './parameterSources';
import classes from './TileOverlay.module.css';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';

export const ParameterOverlays: FC = () => {
    const { parameterKey } = useFilterSidebar();
    const getUiString = useUiStrings();
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
    const tileUuids = useMemo(
        () =>
            Object.keys(tileParameterReferences).filter((tileUuid) =>
                parameterKey === null
                    ? false
                    : tileParameterReferences[tileUuid].includes(parameterKey),
            ),
        [tileParameterReferences, parameterKey],
    );
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        parameterKey !== null,
    );

    if (parameterKey === null) return null;

    return (
        <>
            {Object.entries(targets).map(([tileUuid, element]) =>
                createPortal(
                    <Group gap="xxs" wrap="wrap" className={classes.chips}>
                        {[parameterKey].map((key) => {
                            const entry = sources[key]?.find(
                                (source) => source.tileUuid === tileUuid,
                            );
                            if (!entry) return null;
                            const label =
                                parameterDefinitions[key]?.label ?? key;
                            return (
                                <Badge
                                    key={key}
                                    tt="none"
                                    color={
                                        entry.source === 'none'
                                            ? 'yellow.8'
                                            : undefined
                                    }
                                >
                                    {entry.source === 'none'
                                        ? `${label}: needs a value`
                                        : `${label}: ${formatParameterValue(entry.value)} ${getUiString(`parameters.source.${entry.source}`)}`}
                                </Badge>
                            );
                        })}
                    </Group>,
                    element,
                    `parameters-${tileUuid}`,
                ),
            )}
        </>
    );
};
