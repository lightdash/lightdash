import {
    getEffectiveOptionValues,
    type ApiError,
    type DataAppVizContext,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useParams } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useChartVersionPreview } from '../../features/apps/ChartVersionPreview/useChartVersionPreview';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from '../../features/apps/hooks/useDataAppVizRender';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import { reconcileDataAppVizFieldMapping } from '../../features/apps/utils/autoMapDataAppVizFields';
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

const getTerminalRequestErrorMessage = (
    errors: Array<ApiError | null | undefined>,
): string | undefined => {
    if (errors.some((error) => error?.error.statusCode === 403)) {
        return "You don't have access to this custom chart type.";
    }

    if (errors.some((error) => error?.error.statusCode === 404)) {
        return 'This custom chart type could not be found. It may have been deleted.';
    }

    return undefined;
};

const DataAppVizRenderer: FC<Props> = ({ onScreenshotReady }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const {
        visualizationConfig,
        resultsData,
        colorPalette,
        itemsMap,
        savedChartUuid,
    } = useVisualizationContext();
    const { embedToken } = useEmbed();
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

    const chartVersionUuid = useChartVersionPreview();
    const renderTarget = useMemo(
        () => ({ isEmbedded: !!embedToken, savedChartUuid, chartVersionUuid }),
        [embedToken, savedChartUuid, chartVersionUuid],
    );
    const { data: renderMetadata, error: renderMetadataError } =
        useDataAppVizRenderMetadata(
            projectUuid,
            dataAppVizUuid || undefined,
            renderTarget,
        );
    const readyMetadata =
        renderMetadata?.state === 'ready' ? renderMetadata : undefined;
    const { data: token, error: previewTokenError } = useDataAppVizPreviewToken(
        projectUuid,
        dataAppVizUuid || undefined,
        readyMetadata?.version,
        renderTarget,
    );
    const configOptions = readyMetadata?.schema.configOptions;
    const fields = readyMetadata?.schema.fields;

    const dataAppVizContext = useMemo<DataAppVizContext | undefined>(() => {
        if (!rows || !configOptions || !fields) return undefined;
        return {
            // Reconciled against the contract and columns in force now, so a
            // rebuilt viz never renders through a binding the panel no longer
            // shows.
            fieldMapping: reconcileDataAppVizFieldMapping(
                fields,
                itemsMap ?? {},
                fieldMapping ?? {},
            ),
            rows,
            options: getEffectiveOptionValues(
                configOptions,
                optionValues ?? {},
            ),
            // Already resolved through the full palette cascade and dark-mode
            // corrected by the visualization context.
            colorPalette,
        };
    }, [
        fields,
        itemsMap,
        fieldMapping,
        rows,
        configOptions,
        optionValues,
        colorPalette,
    ]);

    if (!projectUuid || !dataAppVizUuid) {
        return (
            <DataAppVizPlaceholder message="Pick a custom chart type to render." />
        );
    }

    const terminalRequestErrorMessage = getTerminalRequestErrorMessage([
        renderMetadataError,
        previewTokenError,
    ]);
    if (terminalRequestErrorMessage) {
        return <DataAppVizPlaceholder message={terminalRequestErrorMessage} />;
    }

    if (!renderMetadata) {
        return (
            <DataAppVizPlaceholder
                message={
                    renderMetadataError
                        ? 'Custom chart type could not be loaded.'
                        : 'Loading custom chart type…'
                }
            />
        );
    }

    if (renderMetadata.state === 'building') {
        return (
            <DataAppVizPlaceholder message="Custom chart type is still generating…" />
        );
    }

    if (renderMetadata.state === 'failed') {
        return (
            <DataAppVizPlaceholder message="Custom chart type failed to generate." />
        );
    }

    if (!token) {
        return (
            <DataAppVizPlaceholder
                message={
                    previewTokenError
                        ? 'Custom chart type could not be loaded.'
                        : 'Loading custom chart type…'
                }
            />
        );
    }

    const previewUrl = `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${renderMetadata.version}/t/${token}/?r=0#transport=postMessage&projectUuid=${projectUuid}`;

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
