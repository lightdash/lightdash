import {
    type AppSdkLineageHighlight,
    type AppSdkLineageSelection,
    type DataAppInsightAction,
    type DataAppInsightsPayload,
    type DataAppVizContext,
} from '@lightdash/common';
import { Group, Loader, Text } from '@mantine/core';
import { forwardRef } from 'react';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../AppIframePreview';
import { getVisiblePreviewTokenError } from '../hooks/previewTokenQueryOptions';
import { useAppPreviewToken } from '../hooks/useAppPreviewToken';
import type {
    ExternalRequestEvent,
    PipelineEvent,
    QueryEvent,
    SdkManifest,
} from '../hooks/useAppSdkBridge';
import { usePreviewOrigin } from '../previewOrigin';
import { buildAppPreviewSrc, useAppDevSrc } from '../utils/appDevSrc';

export type AppPreviewProps = {
    projectUuid: string;
    appUuid: string;
    version: number;
    /** Bumping this changes the iframe URL to force a reload: the new query
     *  string defeats caching and flushes in-iframe state. */
    refreshKey: number;
    /** Send the iframe's metric queries with `invalidateCache` so the
     *  warehouse results cache is bypassed. */
    invalidateCache?: boolean;
    onQueryEvent?: (event: QueryEvent) => void;
    onExternalRequestEvent?: (event: ExternalRequestEvent) => void;
    inspectorEnabled?: boolean;
    onElementSelected?: (event: { label: string }) => void;
    onInspectorAvailabilityChange?: (available: boolean) => void;
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    onInspectorCancelled?: () => void;
    lineageEnabled?: boolean;
    onLineageAvailabilityChange?: (available: boolean) => void;
    onLineageSelected?: (event: AppSdkLineageSelection) => void;
    lineageHighlight?: AppSdkLineageHighlight | null;
    onPipelineEvent?: (event: PipelineEvent) => void;
    onLineageCancelled?: () => void;
    dataAppVizContext?: DataAppVizContext;
    dataAppVizMode?: boolean;
    onVizSubtotalsIntent?: (
        intentBody: unknown,
    ) => Promise<{ rows: DataAppVizContext['rows'] }>;
    onSdkManifest?: (manifest: SdkManifest) => void;
    /** Whether the app may mirror its own state into the page URL. */
    urlStateSync?: boolean;
    /** The host's AI analysis of the current view, pushed into the app. */
    insights?: DataAppInsightsPayload | null;
    onInsightAction?: (action: DataAppInsightAction) => void;
    onInsightsInUse?: () => void;
    onInsightInstructionsChange?: (instructions: string | null) => void;
    onInsightAnalyseOnLoadChange?: (analyseOnLoad: boolean | null) => void;
    onMountedQueriesChange?: (queryUuids: string[]) => void;
};

const AppPreview = forwardRef<AppIframePreviewHandle, AppPreviewProps>(
    (
        {
            projectUuid,
            appUuid,
            version,
            refreshKey,
            invalidateCache,
            onQueryEvent,
            onExternalRequestEvent,
            inspectorEnabled,
            onElementSelected,
            onInspectorAvailabilityChange,
            onScreenshotAvailabilityChange,
            onInspectorCancelled,
            lineageEnabled,
            onLineageAvailabilityChange,
            onLineageSelected,
            lineageHighlight,
            onPipelineEvent,
            onLineageCancelled,
            dataAppVizContext,
            dataAppVizMode,
            onVizSubtotalsIntent,
            onSdkManifest,
            urlStateSync = true,
            insights,
            onInsightAction,
            onInsightsInUse,
            onInsightInstructionsChange,
            onInsightAnalyseOnLoadChange,
            onMountedQueriesChange,
        },
        ref,
    ) => {
        const {
            data: token,
            isLoading,
            error,
        } = useAppPreviewToken(
            projectUuid,
            appUuid,
            version,
            dataAppVizMode ? 'chart' : 'builder',
        );

        const previewOrigin = usePreviewOrigin();
        const appDevSrc = useAppDevSrc();
        const preview = token
            ? buildAppPreviewSrc({
                  devSrc: appDevSrc,
                  previewOrigin,
                  projectUuid,
                  appUuid,
                  version,
                  token,
                  refreshKey,
              })
            : undefined;
        const previewUrl = preview?.src;
        const visibleError = getVisiblePreviewTokenError(error, !!token);

        if (isLoading) {
            return (
                <Group gap="sm" p="md" justify="center">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                        Loading preview...
                    </Text>
                </Group>
            );
        }

        if (visibleError) {
            return (
                <Text c="red" p="md" size="sm">
                    Failed to load preview:{' '}
                    {visibleError instanceof Error
                        ? visibleError.message
                        : 'Unknown error'}
                </Text>
            );
        }

        if (!previewUrl || !token) return null;

        return (
            <AppIframePreview
                ref={ref}
                src={previewUrl}
                previewToken={token}
                expectedPreviewOrigin={preview?.origin ?? previewOrigin}
                projectUuid={projectUuid}
                appUuid={appUuid}
                identityKey={appUuid}
                invalidateCache={invalidateCache}
                onQueryEvent={onQueryEvent}
                onExternalRequestEvent={onExternalRequestEvent}
                inspectorEnabled={inspectorEnabled}
                onElementSelected={onElementSelected}
                onInspectorAvailabilityChange={onInspectorAvailabilityChange}
                onScreenshotAvailabilityChange={onScreenshotAvailabilityChange}
                onInspectorCancelled={onInspectorCancelled}
                lineageEnabled={lineageEnabled}
                onLineageAvailabilityChange={onLineageAvailabilityChange}
                onLineageSelected={onLineageSelected}
                lineageHighlight={lineageHighlight}
                onPipelineEvent={onPipelineEvent}
                onLineageCancelled={onLineageCancelled}
                capabilities={{ gsheetExport: true }}
                dataAppVizContext={dataAppVizContext}
                dataAppVizMode={dataAppVizMode}
                onVizSubtotalsIntent={onVizSubtotalsIntent}
                urlStateSync={urlStateSync}
                onSdkManifest={onSdkManifest}
                insights={insights}
                onInsightAction={onInsightAction}
                onInsightsInUse={onInsightsInUse}
                onInsightInstructionsChange={onInsightInstructionsChange}
                onInsightAnalyseOnLoadChange={onInsightAnalyseOnLoadChange}
                onMountedQueriesChange={onMountedQueriesChange}
            />
        );
    },
);

AppPreview.displayName = 'AppPreview';

export default AppPreview;
