import { type DataAppVizContext } from '@lightdash/common';
import { Group, Loader, Text } from '@mantine/core';
import { forwardRef } from 'react';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../AppIframePreview';
import { getVisiblePreviewTokenError } from '../hooks/previewTokenQueryOptions';
import { useAppPreviewToken } from '../hooks/useAppPreviewToken';
import type {
    ExternalRequestEvent,
    QueryEvent,
    SdkManifest,
} from '../hooks/useAppSdkBridge';
import { usePreviewOrigin } from '../previewOrigin';

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
    onLineageSelected?: (event: { queryUuid: string }) => void;
    lineageHighlightQueryUuid?: string | null;
    onLineageCancelled?: () => void;
    dataAppVizContext?: DataAppVizContext;
    onSdkManifest?: (manifest: SdkManifest) => void;
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
            lineageHighlightQueryUuid,
            onLineageCancelled,
            dataAppVizContext,
            onSdkManifest,
        },
        ref,
    ) => {
        const {
            data: token,
            isLoading,
            error,
        } = useAppPreviewToken(projectUuid, appUuid, version);

        const previewOrigin = usePreviewOrigin();
        const previewUrl = token
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${version}/t/${token}/?r=${refreshKey}#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;
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
                expectedPreviewOrigin={previewOrigin}
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
                lineageHighlightQueryUuid={lineageHighlightQueryUuid}
                onLineageCancelled={onLineageCancelled}
                capabilities={{ gsheetExport: true }}
                dataAppVizContext={dataAppVizContext}
                urlStateSync
                onSdkManifest={onSdkManifest}
            />
        );
    },
);

AppPreview.displayName = 'AppPreview';

export default AppPreview;
