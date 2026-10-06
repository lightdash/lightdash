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
    const { isParametersOpen } = useFilterSidebar();
    const getUiString = useUiStrings();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    const sources = useMemo(
        () =>
            getParameterSources({
                parameterValues,
                tileParameterReferences,
                parameterDefinitions,
            }),
        [parameterValues, tileParameterReferences, parameterDefinitions],
    );
    const tileUuids = useMemo(
        () =>
            Object.keys(tileParameterReferences).filter(
                (tileUuid) => tileParameterReferences[tileUuid].length > 0,
            ),
        [tileParameterReferences],
    );
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        isParametersOpen,
    );

    if (!isParametersOpen) return null;

    return (
        <>
            {Object.entries(targets).map(([tileUuid, element]) =>
                createPortal(
                    <Group gap="xxs" wrap="wrap" className={classes.chips}>
                        {tileParameterReferences[tileUuid]?.map((key) => {
                            const entry = sources[key]?.find(
                                (source) => source.tileUuid === tileUuid,
                            );
                            if (!entry) return null;
                            const label =
                                parameterDefinitions[key]?.label ?? key;
                            return (
                                <Badge key={key} tt="none">
                                    {entry.source === 'chart'
                                        ? `${label}: chart value`
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
