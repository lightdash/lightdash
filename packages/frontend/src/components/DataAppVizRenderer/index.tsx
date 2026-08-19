import {
    getEffectiveOptionValues,
    hasCustomBinDimension,
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
import { getVisiblePreviewTokenError } from '../../features/apps/hooks/previewTokenQueryOptions';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from '../../features/chartTypes/hooks/useDataAppVizRender';
import { reconcileDataAppVizFieldMapping } from '../../features/chartTypes/utils/autoMapDataAppVizFields';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useExplore } from '../../hooks/useExplore';
import MantineIcon from '../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { buildVizUnderlyingDataRequest } from './vizUnderlyingDataRequest';

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
        minimal,
        parameters,
        dateZoom,
        resolvedTimezone,
    } = useVisualizationContext();
    const { embedToken } = useEmbed();
    const { canViewUnderlyingData } = useContextMenuPermissions();
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
    const pivotDetails = resultsData?.pivotDetails ?? null;

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

    const metricQuery = resultsData?.metricQuery;
    const sourceQueryUuid = resultsData?.queryUuid;

    // Explore-independent gating, mirroring regular chart context menus: no
    // query (builder canvas/sample previews), no permission, custom bin
    // dimensions, embeds (GLITCH-592) and screenshot renders all disable
    // underlying data.
    const underlyingDataPreconditions =
        !!sourceQueryUuid &&
        !!metricQuery &&
        canViewUnderlyingData &&
        !hasCustomBinDimension(metricQuery) &&
        !embedToken &&
        !minimal &&
        !pivotDetails;

    const { data: explore } = useExplore(metricQuery?.exploreName, {
        refetchOnMount: false,
        // Passing `enabled` overrides useExplore's own guards — keep them.
        enabled:
            underlyingDataPreconditions &&
            !!metricQuery?.exploreName &&
            !!projectUuid,
    });

    // Reconciled against the contract and columns in force now, so a rebuilt
    // viz never renders through a binding the panel no longer shows. Shared by
    // the context push and the rewrite callback, so clicks resolve through
    // exactly what the iframe was told.
    const reconciledFieldMapping = useMemo(
        () =>
            fields
                ? reconcileDataAppVizFieldMapping(
                      fields,
                      itemsMap ?? {},
                      fieldMapping ?? {},
                  )
                : undefined,
        [fields, itemsMap, fieldMapping],
    );

    const underlyingDataEnabled =
        underlyingDataPreconditions && !!explore && !!reconciledFieldMapping;

    // enabled:false ⇒ callback undefined ⇒ the bridge answers the virtual
    // route with an error — enforcement is structural, not menu-side.
    const rewriteVizUnderlyingDataRequest = useMemo(() => {
        if (
            !underlyingDataEnabled ||
            !projectUuid ||
            !sourceQueryUuid ||
            !metricQuery ||
            !explore ||
            !reconciledFieldMapping
        ) {
            return undefined;
        }
        return (intentBody: unknown) =>
            buildVizUnderlyingDataRequest(intentBody, {
                projectUuid,
                queryUuid: sourceQueryUuid,
                fieldMapping: reconciledFieldMapping,
                itemsMap: itemsMap ?? {},
                metricQuery,
                explore,
                resolvedTimezone,
                parameters,
                dateZoom,
            });
    }, [
        underlyingDataEnabled,
        projectUuid,
        sourceQueryUuid,
        metricQuery,
        explore,
        reconciledFieldMapping,
        itemsMap,
        resolvedTimezone,
        parameters,
        dateZoom,
    ]);

    const dataAppVizContext = useMemo<DataAppVizContext | undefined>(() => {
        if (!rows || !configOptions || !reconciledFieldMapping)
            return undefined;
        return {
            fieldMapping: reconciledFieldMapping,
            rows,
            options: getEffectiveOptionValues(
                configOptions,
                optionValues ?? {},
            ),
            // Already resolved through the full palette cascade and dark-mode
            // corrected by the visualization context.
            colorPalette,
            pivotDetails,
            underlyingData: { enabled: underlyingDataEnabled },
        };
    }, [
        reconciledFieldMapping,
        rows,
        configOptions,
        optionValues,
        colorPalette,
        pivotDetails,
        underlyingDataEnabled,
    ]);

    if (!projectUuid || !dataAppVizUuid) {
        return (
            <DataAppVizPlaceholder message="Pick a custom chart type to render." />
        );
    }

    const terminalRequestErrorMessage = getTerminalRequestErrorMessage([
        renderMetadataError,
        getVisiblePreviewTokenError(previewTokenError, !!token),
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

    if (renderMetadata.state === 'unavailable') {
        return (
            <DataAppVizPlaceholder message="Custom chart type preview is unavailable." />
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
            previewToken={token}
            expectedPreviewOrigin={previewOrigin}
            projectUuid={projectUuid}
            appUuid={dataAppVizUuid}
            identityKey={dataAppVizUuid}
            dataAppVizContext={dataAppVizContext}
            rewriteVizUnderlyingDataRequest={rewriteVizUnderlyingDataRequest}
        />
    );
};

export default DataAppVizRenderer;
