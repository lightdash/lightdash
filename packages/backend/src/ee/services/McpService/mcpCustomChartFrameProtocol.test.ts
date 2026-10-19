import type { DataAppVizContext } from '@lightdash/common';
import {
    CUSTOM_CHART_REQUEST_UNAVAILABLE_ERROR,
    getCustomChartFrameHandshake,
    getCustomChartFrameUrl,
    handleCustomChartFrameMessage,
} from './mcpCustomChartFrameProtocol';

const vizContext: DataAppVizContext = {
    fieldMapping: { category: 'orders_status' },
    fields: {},
    rows: [],
    options: {},
    colorPalette: ['#111111'],
    seriesColors: {},
    valueColors: {},
    pivotDetails: null,
    underlyingData: { enabled: false },
    drillDown: { enabled: false },
    pointMenu: { enabled: false },
    subtotals: { enabled: false, dimensions: [] },
};
const state = { vizContext, colorScheme: 'dark' as const };

describe('mcp custom chart frame protocol', () => {
    it('puts the transport, project and theme in the frame hash', () => {
        expect(
            getCustomChartFrameUrl({
                blobUrl: 'blob:https://host.example/abc',
                projectUuid: 'project-uuid',
                colorScheme: 'dark',
            }),
        ).toBe(
            'blob:https://host.example/abc#transport=postMessage&projectUuid=project-uuid&theme=dark',
        );
    });

    it('releases the SDK and sets the theme on load', () => {
        expect(getCustomChartFrameHandshake('light')).toEqual([
            { type: 'lightdash:sdk:ready' },
            { type: 'lightdash:sdk:theme', colorScheme: 'light' },
        ]);
    });

    it('pushes the viz context when the chart type asks for it', () => {
        expect(
            handleCustomChartFrameMessage(
                { type: 'lightdash:sdk:viz-context-request' },
                state,
            ),
        ).toEqual({
            kind: 'reply',
            message: {
                type: 'lightdash:sdk:data-app-viz-context',
                ...vizContext,
            },
        });
    });

    it('answers a theme request with the current scheme', () => {
        expect(
            handleCustomChartFrameMessage(
                { type: 'lightdash:sdk:theme-request' },
                state,
            ),
        ).toEqual({
            kind: 'reply',
            message: { type: 'lightdash:sdk:theme', colorScheme: 'dark' },
        });
    });

    it('reports the paint acknowledgement', () => {
        expect(
            handleCustomChartFrameMessage(
                { type: 'lightdash:sdk:viz-rendered', renderId: 'x' },
                state,
            ),
        ).toEqual({ kind: 'rendered' });
    });

    it.each([
        ['lightdash:sdk:fetch', 'lightdash:sdk:fetch-response'],
        [
            'lightdash:sdk:external-fetch',
            'lightdash:sdk:external-fetch-response',
        ],
    ])('refuses %s with an error response', (type, responseType) => {
        expect(
            handleCustomChartFrameMessage(
                { type, id: 'req-1', method: 'GET', path: '/x' },
                state,
            ),
        ).toEqual({
            kind: 'reply',
            message: {
                type: responseType,
                id: 'req-1',
                error: CUSTOM_CHART_REQUEST_UNAVAILABLE_ERROR,
            },
        });
    });

    it.each([
        null,
        'lightdash:sdk:viz-context-request',
        {},
        { type: 'lightdash:sdk:manifest' },
        { type: 'lightdash:sdk:fetch' },
    ])('ignores %j', (data) => {
        expect(handleCustomChartFrameMessage(data, state)).toEqual({
            kind: 'ignore',
        });
    });
});
