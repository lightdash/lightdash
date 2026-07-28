import {
    getEffectiveOptionValues,
    type DataAppVizContext,
} from '@lightdash/common';
import { Stack, Text } from '@mantine-8/core';
import { IconPuzzle } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useParams } from 'react-router';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../../features/apps/hooks/useAppPreviewToken';
import { useDataAppVisualization } from '../../features/apps/hooks/useDataAppVisualization';
import { useGetApp } from '../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import MantineIcon from '../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

type Props = {
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const DataAppVizPlaceholder: FC<{ message: string }> = ({ message }) => (
    <Stack align="center" justify="center" gap="xs" h="100%" w="100%">
        <MantineIcon icon={IconPuzzle} size="xl" color="ldGray.5" />
        <Text c="dimmed" size="sm" ta="center">
            {message}
        </Text>
    </Stack>
);

const DataAppVizRenderer: FC<Props> = ({ onScreenshotReady }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { visualizationConfig, resultsData, colorPalette } =
        useVisualizationContext();
    const previewOrigin = usePreviewOrigin();
    const hasSignaledScreenshotReady = useRef(false);

    // Signal screenshot readiness on mount so dashboard capture isn't blocked
    // waiting on the sandboxed iframe (which runs its own async query).
    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        onScreenshotReady?.();
        hasSignaledScreenshotReady.current = true;
    }, [onScreenshotReady]);

    // Fetch every page so the renderer gets all rows — surfaces that don't
    // auto-fetch (dashboard tiles) would otherwise push a partial result.
    useEffect(() => {
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    const config = isDataAppVizVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig
        : undefined;
    const dataAppVizUuid = config?.dataAppVizUuid ?? '';
    const fieldMapping = config?.fieldMapping;
    const optionValues = config?.optionValues;
    const rows = resultsData?.rows;

    // Hooks run unconditionally; the queries are `enabled`-gated on their args.
    const { data: appData } = useGetApp(
        projectUuid,
        dataAppVizUuid || undefined,
    );

    // The declaration is the only source of option defaults, so the renderer
    // fetches it to resolve effective values.
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid || undefined,
    );
    const configOptions = dataAppViz?.schema?.configOptions;

    // Latest READY version of the chosen data app viz drives the preview.
    const readyVersion = useMemo(() => {
        const versions = appData?.pages.flatMap((page) => page.versions) ?? [];
        const ready = versions.filter((v) => v.status === 'ready');
        if (ready.length === 0) return undefined;
        return ready.reduce((max, v) => Math.max(max, v.version), 0);
    }, [appData]);

    const { data: token } = useAppPreviewToken(
        projectUuid,
        dataAppVizUuid || undefined,
        readyVersion,
    );

    const dataAppVizContext = useMemo<DataAppVizContext | undefined>(() => {
        if (!rows || !configOptions) return undefined;
        return {
            fieldMapping: fieldMapping ?? {},
            rows,
            options: getEffectiveOptionValues(
                configOptions,
                optionValues ?? {},
            ),
            // Already resolved through the full palette cascade and dark-mode
            // corrected by the visualization context.
            colorPalette,
        };
    }, [fieldMapping, rows, configOptions, optionValues, colorPalette]);

    if (!projectUuid || !dataAppVizUuid) {
        return (
            <DataAppVizPlaceholder message="Pick a data app visualization to render." />
        );
    }

    if (readyVersion === undefined || !token) {
        return (
            <DataAppVizPlaceholder message="Data app visualization is still generating…" />
        );
    }

    const previewUrl = `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${readyVersion}/t/${token}/?r=0#transport=postMessage&projectUuid=${projectUuid}`;

    return (
        <AppIframePreview
            src={previewUrl}
            expectedPreviewOrigin={previewOrigin}
            projectUuid={projectUuid}
            appUuid={dataAppVizUuid}
            identityKey={dataAppVizUuid}
            dataAppVizContext={dataAppVizContext}
        />
    );
};

export default DataAppVizRenderer;
