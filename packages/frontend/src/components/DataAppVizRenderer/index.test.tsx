import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
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
            | {
                  state: 'building';
                  latestBuildInProgress: true;
              }
            | {
                  state: 'failed';
                  latestBuildInProgress: false;
              }
            | undefined,
    },
    metadataError: {
        current: undefined as ReturnType<typeof apiError> | undefined,
    },
    token: { current: 'preview-token' as string | undefined },
    tokenError: {
        current: undefined as ReturnType<typeof apiError> | undefined,
    },
    embedToken: { current: undefined as string | undefined },
    dataAppVizUuid: { current: 'viz-uuid' as string | undefined },
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
        return {
            data: mocks.metadata.current,
            error: mocks.metadataError.current,
        };
    },
    useDataAppVizPreviewToken: (...args: unknown[]) => {
        mocks.previewTokenHook(...args);
        return { data: mocks.token.current, error: mocks.tokenError.current };
    },
}));
vi.mock('../../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));
vi.mock('../../hooks/useContextMenuPermissions', () => ({
    useContextMenuPermissions: () => ({ canViewUnderlyingData: true }),
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));
vi.mock('../LightdashVisualization/types', () => ({
    isDataAppVizVisualizationConfig: () => true,
}));
vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartConfig: {
                validConfig: {
                    dataAppVizUuid: mocks.dataAppVizUuid.current,
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

function apiError(statusCode: number) {
    return {
        status: 'error' as const,
        error: {
            name: 'ApiError',
            statusCode,
            message: 'Request failed',
            data: {},
        },
    };
}

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
        mocks.metadataError.current = undefined;
        mocks.token.current = 'preview-token';
        mocks.tokenError.current = undefined;
        mocks.embedToken.current = undefined;
        mocks.dataAppVizUuid.current = 'viz-uuid';
        mocks.iframePreview.mockClear();
        mocks.renderMetadataHook.mockClear();
        mocks.previewTokenHook.mockClear();
        mocks.setFetchAll.mockClear();
    });

    it('prompts for a visualization when none is selected', () => {
        mocks.dataAppVizUuid.current = undefined;

        renderRenderer();

        expect(
            screen.getByText('Pick a custom chart type to render.'),
        ).toBeInTheDocument();
    });

    it('shows a neutral loading state while render metadata is pending', () => {
        mocks.metadata.current = undefined;

        renderRenderer();

        expect(
            screen.getByText('Loading custom chart type…'),
        ).toBeInTheDocument();
        expect(mocks.iframePreview).not.toHaveBeenCalled();
    });

    it('shows generating only for metadata building state', () => {
        mocks.metadata.current = {
            state: 'building',
            latestBuildInProgress: true,
        };

        renderRenderer();

        expect(
            screen.getByText('Custom chart type is still generating…'),
        ).toBeInTheDocument();
    });

    it('shows a build failure for metadata failed state', () => {
        mocks.metadata.current = {
            state: 'failed',
            latestBuildInProgress: false,
        };

        renderRenderer();

        expect(
            screen.getByText('Custom chart type failed to generate.'),
        ).toBeInTheDocument();
    });

    it.each([
        ['metadata', 403, "You don't have access to this custom chart type."],
        ['token', 403, "You don't have access to this custom chart type."],
        [
            'metadata',
            404,
            'This custom chart type could not be found. It may have been deleted.',
        ],
        [
            'token',
            404,
            'This custom chart type could not be found. It may have been deleted.',
        ],
    ])(
        'maps a %s HTTP %s response to its explicit state',
        (source, statusCode, message) => {
            if (source === 'metadata') {
                mocks.metadata.current = undefined;
                mocks.metadataError.current = apiError(statusCode);
            } else {
                mocks.token.current = undefined;
                mocks.tokenError.current = apiError(statusCode);
            }

            renderRenderer();

            expect(screen.getByText(message)).toBeInTheDocument();
            expect(mocks.iframePreview).not.toHaveBeenCalled();
        },
    );

    it('shows a load failure for an unexpected request error', () => {
        mocks.token.current = undefined;
        mocks.tokenError.current = apiError(500);

        renderRenderer();

        expect(
            screen.getByText('Custom chart type could not be loaded.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Custom chart type is still generating…'),
        ).not.toBeInTheDocument();
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

    it('renders the last good version while a newer build is running', () => {
        mocks.metadata.current = {
            ...readyMetadata(),
            latestBuildInProgress: true,
        };

        renderRenderer();

        expect(mocks.iframePreview).toHaveBeenCalled();
        expect(
            screen.queryByText('Custom chart type is still generating…'),
        ).not.toBeInTheDocument();
    });

    it('keeps rendering the last good version after a transient metadata refetch error', () => {
        mocks.metadata.current = {
            ...readyMetadata(),
            latestBuildInProgress: true,
        };
        mocks.metadataError.current = apiError(500);

        renderRenderer();

        expect(mocks.iframePreview).toHaveBeenCalled();
        expect(
            screen.queryByText('Custom chart type could not be loaded.'),
        ).not.toBeInTheDocument();
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
