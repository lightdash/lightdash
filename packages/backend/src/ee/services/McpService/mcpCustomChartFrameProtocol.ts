import type { DataAppVizContext } from '@lightdash/common';

// Host side of the chart type SDK bridge, bundled into the MCP chart view.
// Mirrors the subset of the web app's useAppSdkBridge a chart type needs.

export type CustomChartColorScheme = 'light' | 'dark';

export type CustomChartHostMessage =
    | { type: 'lightdash:sdk:ready' }
    | { type: 'lightdash:sdk:theme'; colorScheme: CustomChartColorScheme }
    | ({ type: 'lightdash:sdk:data-app-viz-context' } & DataAppVizContext)
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
): CustomChartHostMessage => ({ type: 'lightdash:sdk:theme', colorScheme });

/** Sent on every frame load: releases the SDK's transports and sets the theme. */
export const getCustomChartFrameHandshake = (
    colorScheme: CustomChartColorScheme,
): CustomChartHostMessage[] => [
    { type: 'lightdash:sdk:ready' },
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
        case 'lightdash:sdk:viz-context-request':
            return {
                kind: 'reply',
                message: {
                    type: 'lightdash:sdk:data-app-viz-context',
                    ...vizContext,
                },
            };
        case 'lightdash:sdk:theme-request':
            return {
                kind: 'reply',
                message: getCustomChartThemeMessage(colorScheme),
            };
        case 'lightdash:sdk:viz-rendered':
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
