import type { DataAppVizContext } from '@lightdash/common';
import {
    CUSTOM_CHART_REQUEST_UNAVAILABLE_ERROR,
    getCustomChartFrameHandshake,
    getCustomChartFrameUrl,
    getCustomChartRenderDeadlineAction,
    handleCustomChartFrameMessage,
    INITIAL_CUSTOM_CHART_RENDER_READINESS,
    shouldShowTableOnRenderTimeout,
    updateCustomChartRenderReadiness,
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

describe('mcp custom chart render deadline', () => {
    const afterMessages = (messages: unknown[]) =>
        shouldShowTableOnRenderTimeout(
            messages.reduce(
                updateCustomChartRenderReadiness,
                INITIAL_CUSTOM_CHART_RENDER_READINESS,
            ),
        );
    const manifest = (features: unknown) => ({
        type: 'lightdash:sdk:manifest',
        sdkVersion: '0.1.0',
        features,
    });

    const contextRequest = { type: 'lightdash:sdk:viz-context-request' };

    it.each([
        ['a frame that never speaks the SDK', true, []],
        [
            'a frame that sends only unrelated messages',
            true,
            [{ type: 'something-else' }, null],
        ],
        ['a legacy bundle that requested the context', false, [contextRequest]],
        [
            'a bundle whose manifest lacks viz-rendered',
            false,
            [manifest(['theme']), contextRequest],
        ],
        [
            'a signalling bundle that never acknowledges',
            true,
            [manifest(['viz-rendered']), contextRequest],
        ],
        [
            'a signalling bundle that declares the feature late',
            true,
            [contextRequest, manifest(['viz-rendered'])],
        ],
        [
            'a signalling bundle that acknowledged its paint',
            false,
            [
                manifest(['viz-rendered']),
                contextRequest,
                { type: 'lightdash:sdk:viz-rendered', renderId: 'r1' },
            ],
        ],
        ['a manifest without features', true, [manifest(undefined)]],
        ['a manifest with string features', true, [manifest('viz-rendered')]],
        ['a manifest with non-string features', true, [manifest([1])]],
    ])('for %s shows the table: %s', (_case, showTable, messages) => {
        expect(afterMessages(messages)).toBe(showTable);
    });
});

describe('mcp custom chart render deadline while hidden', () => {
    const unacknowledged = {
        sdkSeen: true,
        supportsRenderSignal: true,
        rendered: false,
    };

    const rendered = { ...unacknowledged, rendered: true };
    const legacy = { ...unacknowledged, supportsRenderSignal: false };

    it.each([
        ['an unacknowledged chart', true, 'wait-for-visible', unacknowledged],
        ['an unacknowledged chart', false, 'show-table', unacknowledged],
        ['an acknowledged chart', true, 'keep-chart', rendered],
        ['an acknowledged chart', false, 'keep-chart', rendered],
        ['a legacy bundle', true, 'keep-chart', legacy],
    ] as const)(
        'for %s with documentHidden=%s returns %s',
        (_case, documentHidden, action, readiness) => {
            expect(
                getCustomChartRenderDeadlineAction(readiness, {
                    documentHidden,
                }),
            ).toBe(action);
        },
    );
});
