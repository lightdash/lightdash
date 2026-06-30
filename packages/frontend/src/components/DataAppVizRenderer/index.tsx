import { type DataAppVizContext } from '@lightdash/common';
import { Stack, Text } from '@mantine-8/core';
import { IconPuzzle } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useParams } from 'react-router';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../../features/apps/hooks/useAppPreviewToken';
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
    const { visualizationConfig, resultsData } = useVisualizationContext();
    const previewOrigin = usePreviewOrigin();
    const hasSignaledScreenshotReady = useRef(false);

    // Signal screenshot readiness on mount so dashboard capture isn't blocked
    // waiting on the sandboxed iframe (which runs its own async query).
    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        onScreenshotReady?.();
        hasSignaledScreenshotReady.current = true;
    }, [onScreenshotReady]);

    const config = isDataAppVizVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig
        : undefined;
    const dataAppVizUuid = config?.dataAppVizUuid ?? '';
    const fieldMapping = config?.fieldMapping;
    const rows = resultsData?.rows;

    // Hooks run unconditionally; the queries are `enabled`-gated on their args.
    const { data: appData } = useGetApp(
        projectUuid,
        dataAppVizUuid || undefined,
    );

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
        if (!rows) return undefined;
        return { fieldMapping: fieldMapping ?? {}, rows };
    }, [fieldMapping, rows]);

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
