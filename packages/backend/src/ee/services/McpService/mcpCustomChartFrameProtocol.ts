import type { DataAppVizContext } from '@lightdash/common';
// Only the chart view bundles this module; the server never loads it, and the barrel breaks that bundle.
// eslint-disable-next-line no-restricted-imports
import {
    APP_SDK_COLOR_SCHEME_MESSAGE,
    APP_SDK_COLOR_SCHEME_REQUEST_MESSAGE,
    APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
    APP_SDK_MANIFEST_MESSAGE,
    APP_SDK_READY_MESSAGE,
    APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE,
    APP_SDK_VIZ_RENDERED_MESSAGE,
    type AppColorScheme,
} from '@lightdash/common/src/ee/apps/sdkMessages';

// Host side of the chart type SDK bridge, bundled into the MCP chart view.
// Mirrors the subset of the web app's useAppSdkBridge a chart type needs.

export type CustomChartColorScheme = AppColorScheme;

export type CustomChartHostMessage =
    | { type: typeof APP_SDK_READY_MESSAGE }
    | {
          type: typeof APP_SDK_COLOR_SCHEME_MESSAGE;
          colorScheme: CustomChartColorScheme;
      }
    | ({
          type: typeof APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE;
      } & DataAppVizContext)
    | { type: 'lightdash:sdk:fetch-response'; id: string; error: string }
    | {
          type: 'lightdash:sdk:external-fetch-response';
          id: string;
          error: string;
      };

export type CustomChartFrameAction =
    | { kind: 'reply'; message: CustomChartHostMessage }
    | { kind: 'rendered' }
    | { kind: 'ignore' };

export const CUSTOM_CHART_REQUEST_UNAVAILABLE_ERROR =
    'Data requests are not available in this view.';

/** The SDK picks its transport, project and initial theme from the hash. */
export const getCustomChartFrameUrl = ({
    blobUrl,
    projectUuid,
    colorScheme,
}: {
    blobUrl: string;
    projectUuid: string;
    colorScheme: CustomChartColorScheme;
}): string =>
    `${blobUrl}#${new URLSearchParams({
        transport: 'postMessage',
        projectUuid,
        theme: colorScheme,
    }).toString()}`;

export const getCustomChartThemeMessage = (
    colorScheme: CustomChartColorScheme,
): CustomChartHostMessage => ({
    type: APP_SDK_COLOR_SCHEME_MESSAGE,
    colorScheme,
});

/** Sent on every frame load: releases the SDK's transports and sets the theme. */
export const getCustomChartFrameHandshake = (
    colorScheme: CustomChartColorScheme,
): CustomChartHostMessage[] => [
    { type: APP_SDK_READY_MESSAGE },
    getCustomChartThemeMessage(colorScheme),
];

const getRequestId = (data: object): string | null =>
    'id' in data && typeof data.id === 'string' ? data.id : null;

export const handleCustomChartFrameMessage = (
    data: unknown,
    {
        vizContext,
        colorScheme,
    }: {
        vizContext: DataAppVizContext;
        colorScheme: CustomChartColorScheme;
    },
): CustomChartFrameAction => {
    if (typeof data !== 'object' || data === null || !('type' in data)) {
        return { kind: 'ignore' };
    }
    switch (data.type) {
        case APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE:
            return {
                kind: 'reply',
                message: {
                    type: APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
                    ...vizContext,
                },
            };
        case APP_SDK_COLOR_SCHEME_REQUEST_MESSAGE:
            return {
                kind: 'reply',
                message: getCustomChartThemeMessage(colorScheme),
            };
        case APP_SDK_VIZ_RENDERED_MESSAGE:
            return { kind: 'rendered' };
        case 'lightdash:sdk:fetch':
        case 'lightdash:sdk:external-fetch': {
            const id = getRequestId(data);
            if (id === null) return { kind: 'ignore' };
            return {
                kind: 'reply',
                message: {
                    type:
                        data.type === 'lightdash:sdk:fetch'
                            ? 'lightdash:sdk:fetch-response'
                            : 'lightdash:sdk:external-fetch-response',
                    id,
                    error: CUSTOM_CHART_REQUEST_UNAVAILABLE_ERROR,
                },
            };
        }
        default:
            return { kind: 'ignore' };
    }
};

/**
 * What the frame has said about painting. Bundles built before the SDK's
 * `viz-rendered` feature never acknowledge a paint, so only a bundle that
 * declares the feature, or one that never spoke at all, is held to it.
 */
export type CustomChartRenderReadiness = {
    sdkSeen: boolean;
    supportsRenderSignal: boolean;
    rendered: boolean;
};

export const INITIAL_CUSTOM_CHART_RENDER_READINESS: CustomChartRenderReadiness =
    {
        sdkSeen: false,
        supportsRenderSignal: false,
        rendered: false,
    };

const getManifestFeatures = (data: object): string[] | null =>
    'features' in data &&
    Array.isArray(data.features) &&
    data.features.every((feature: unknown) => typeof feature === 'string')
        ? data.features
        : null;

export const updateCustomChartRenderReadiness = (
    readiness: CustomChartRenderReadiness,
    data: unknown,
): CustomChartRenderReadiness => {
    if (typeof data !== 'object' || data === null || !('type' in data)) {
        return readiness;
    }
    switch (data.type) {
        case APP_SDK_MANIFEST_MESSAGE: {
            const features = getManifestFeatures(data);
            if (features === null) return readiness;
            return {
                ...readiness,
                sdkSeen: true,
                supportsRenderSignal: features.includes('viz-rendered'),
            };
        }
        case APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE:
            return { ...readiness, sdkSeen: true };
        case APP_SDK_VIZ_RENDERED_MESSAGE:
            return { ...readiness, sdkSeen: true, rendered: true };
        default:
            return readiness;
    }
};

/** At the render deadline: fall back to the table, or leave the chart up. */
export const shouldShowTableOnRenderTimeout = ({
    sdkSeen,
    supportsRenderSignal,
    rendered,
}: CustomChartRenderReadiness): boolean =>
    !rendered && (!sdkSeen || supportsRenderSignal);

export type CustomChartRenderDeadlineAction =
    | 'show-table'
    | 'keep-chart'
    | 'wait-for-visible';

/**
 * The paint acknowledgement runs on animation frames, which browsers pause
 * in hidden documents, so a hidden chart waits to be seen before it is judged.
 */
export const getCustomChartRenderDeadlineAction = (
    readiness: CustomChartRenderReadiness,
    { documentHidden }: { documentHidden: boolean },
): CustomChartRenderDeadlineAction => {
    if (!shouldShowTableOnRenderTimeout(readiness)) return 'keep-chart';
    return documentHidden ? 'wait-for-visible' : 'show-table';
};
