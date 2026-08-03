import { MantineProvider } from '@mantine-8/core';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    metadata: {
        current: undefined as
            | {
                  state: 'ready';
                  version: number;
                  latestBuildInProgress: boolean;
                  schema: {
                      fields: Array<never>;
                      configOptions: Array<{
                          type: 'text';
                          name: string;
                          label: string;
                          default: string;
                      }>;
                      colorPalette: null;
                  };
              }
            | undefined,
    },
    token: { current: 'preview-token' as string | undefined },
    embedToken: { current: undefined as string | undefined },
    iframePreview: vi.fn(() => null),
    renderMetadataHook: vi.fn(),
    previewTokenHook: vi.fn(),
    setFetchAll: vi.fn(),
}));

vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: 'project-uuid' }),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: mocks.embedToken.current }),
}));
vi.mock('../../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));
vi.mock('../../features/apps/hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: (...args: unknown[]) => {
        mocks.renderMetadataHook(...args);
        return { data: mocks.metadata.current };
    },
    useDataAppVizPreviewToken: (...args: unknown[]) => {
        mocks.previewTokenHook(...args);
        return { data: mocks.token.current };
    },
}));
vi.mock('../../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));
vi.mock('../LightdashVisualization/types', () => ({
    isDataAppVizVisualizationConfig: () => true,
}));
vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartConfig: {
                validConfig: {
                    dataAppVizUuid: 'viz-uuid',
                    fieldMapping: { category: 'orders.category' },
                    optionValues: { title: 12 },
                },
            },
        },
        savedChartUuid: 'saved-chart-uuid',
        resultsData: {
            rows: [{ 'orders.category': { value: { raw: 'Hardware' } } }],
            setFetchAll: mocks.setFetchAll,
        },
        colorPalette: ['#7162FF'],
    }),
}));

import DataAppVizRenderer from './index';

const renderRenderer = () =>
    render(
        <MantineProvider env="test">
            <DataAppVizRenderer />
        </MantineProvider>,
    );

const readyMetadata = () => ({
    state: 'ready' as const,
    version: 7,
    latestBuildInProgress: false,
    schema: {
        fields: [],
        configOptions: [
            {
                type: 'text' as const,
                name: 'title',
                label: 'Title',
                default: 'Sales',
            },
        ],
        colorPalette: null,
    },
});

describe('DataAppVizRenderer', () => {
    beforeEach(() => {
        mocks.metadata.current = readyMetadata();
        mocks.token.current = 'preview-token';
        mocks.embedToken.current = undefined;
        mocks.iframePreview.mockClear();
        mocks.renderMetadataHook.mockClear();
        mocks.previewTokenHook.mockClear();
        mocks.setFetchAll.mockClear();
    });

    it('waits for render metadata before mounting the iframe', () => {
        mocks.metadata.current = undefined;

        renderRenderer();

        expect(mocks.iframePreview).not.toHaveBeenCalled();
    });

    it('uses the metadata schema to deliver effective options', () => {
        renderRenderer();

        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                dataAppVizContext: expect.objectContaining({
                    options: { title: 'Sales' },
                    colorPalette: ['#7162FF'],
                }),
            }),
            undefined,
        );
    });

    it('requests and renders the exact version selected by metadata', () => {
        renderRenderer();

        expect(mocks.previewTokenHook).toHaveBeenCalledWith(
            'project-uuid',
            'viz-uuid',
            7,
            {
                isEmbedded: false,
                savedChartUuid: 'saved-chart-uuid',
            },
        );
        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                src: 'https://preview.example.com/api/apps/viz-uuid/versions/7/t/preview-token/?r=0#transport=postMessage&projectUuid=project-uuid',
            }),
            undefined,
        );
    });

    it('selects the embed route target when an embed JWT is present', () => {
        mocks.embedToken.current = 'embed-token';

        renderRenderer();

        expect(mocks.renderMetadataHook).toHaveBeenCalledWith(
            'project-uuid',
            'viz-uuid',
            {
                isEmbedded: true,
                savedChartUuid: 'saved-chart-uuid',
            },
        );
    });
});
