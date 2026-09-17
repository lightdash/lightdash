import { DimensionType, FieldType, MetricType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartColorMappingContext } from '../../hooks/useChartColorConfig/context';
import { getMantineThemeOverride } from '../../theme';

// Mirrors the real hook's failSilently contract: TrackingContextType | undefined.
type TrackingMockContext = { track: (...args: unknown[]) => void } | undefined;

const mocks = vi.hoisted(() => ({
    metadata: {
        current: undefined as
            | {
                  state: 'ready';
                  version: number;
                  latestBuildInProgress: boolean;
                  schema: {
                      fields: Array<{
                          name: string;
                          label: string;
                          type: 'dimension' | 'metric';
                          required: boolean;
                      }>;
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
                  state: 'unavailable';
                  latestBuildInProgress: false;
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
    dataAppVizUuid: { current: 'viz-uuid' as string | null },
    dataAppVizVersion: { current: 7 as number | undefined },
    setDataAppVizVersion: vi.fn(),
    iframePreview: vi.fn(
        (_props: {
            onScreenshotAvailabilityChange: (available: boolean) => void;
            onIframeLoad: () => void;
        }) => <iframe data-testid="app-preview" title="App preview" />,
    ),
    renderMetadataHook: vi.fn(),
    previewTokenHook: vi.fn(),
    setFetchAll: vi.fn(),
    canViewUnderlyingData: { current: true },
    openUnderlyingDataModal: vi.fn(),
    metricQueryData: {
        current: undefined as
            | { openUnderlyingDataModal: (...args: unknown[]) => void }
            | undefined,
    },
    isLoading: { current: false },
    explore: { current: undefined as { name: string } | undefined },
    exploreHook: vi.fn(),
    // Extra keys merged into the useVisualizationContext mock return value.
    vizContextOverrides: { current: {} as Record<string, unknown> },
    track: vi.fn(),
    // undefined models no TrackingProvider mounted (e.g. /minimal routes at
    // desktop viewports) — the real fail-silent hook returns undefined there.
    trackingContext: {
        current: undefined as TrackingMockContext,
    },
}));

vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: 'project-uuid' }),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
        <a href={to}>{children}</a>
    ),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: mocks.embedToken.current }),
}));
vi.mock('../../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));
vi.mock('../../features/chartTypes/hooks/useDataAppVizRender', () => ({
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
    useContextMenuPermissions: () => ({
        canViewUnderlyingData: mocks.canViewUnderlyingData.current,
        canDrillInto: false,
    }),
}));
vi.mock('../../hooks/useExplore', () => ({
    useExplore: (...args: unknown[]) => {
        mocks.exploreHook(...args);
        return { data: mocks.explore.current };
    },
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
            },
        },
        health: {
            data: { softDelete: { enabled: true, retentionDays: 30 } },
        },
    }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: (): TrackingMockContext => mocks.trackingContext.current,
}));
vi.mock('../LightdashVisualization/types', () => ({
    isDataAppVizVisualizationConfig: () => true,
}));
vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartConfig: {
                validConfig:
                    mocks.dataAppVizUuid.current === null
                        ? null
                        : {
                              dataAppVizUuid: mocks.dataAppVizUuid.current,
                              dataAppVizVersion:
                                  mocks.dataAppVizVersion.current,
                              fieldMapping: { category: 'orders_category' },
                              optionValues: { title: 12 },
                          },
                setDataAppVizVersion: mocks.setDataAppVizVersion,
            },
        },
        savedChartUuid: 'saved-chart-uuid',
        resultsData: {
            rows: [
                {
                    orders_category: {
                        value: { raw: 'Hardware', formatted: 'Hardware' },
                    },
                },
            ],
            setFetchAll: mocks.setFetchAll,
        },
        itemsMap: {
            orders_category: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                name: 'category',
                label: 'Category',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.category',
                hidden: false,
                colors: { Hardware: '#00ff00' },
            },
            orders_count: {
                fieldType: FieldType.METRIC,
                type: MetricType.COUNT,
                name: 'count',
                label: 'Count',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.count',
                hidden: false,
            },
        },
        colorPalette: ['#7162FF'],
        isLoading: mocks.isLoading.current,
        ...mocks.vizContextOverrides.current,
    }),
}));
vi.mock('../MetricQueryData/useMetricQueryDataContext', () => ({
    useMetricQueryDataContext: () => mocks.metricQueryData.current,
}));

import { SCREENSHOT_READY_FALLBACK_MS } from './constants';
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

const rendererElement = (props?: Parameters<typeof DataAppVizRenderer>[0]) => (
    <MantineProvider env="test" theme={getMantineThemeOverride('light')}>
        <ChartColorMappingContext.Provider value={{ colorMappings: new Map() }}>
            <DataAppVizRenderer {...props} />
        </ChartColorMappingContext.Provider>
    </MantineProvider>
);

const renderRenderer = (props?: Parameters<typeof DataAppVizRenderer>[0]) =>
    render(rendererElement(props));

const loadIframe = () => {
    const iframeProps = mocks.iframePreview.mock.lastCall?.[0];
    if (!iframeProps) throw new Error('Expected the iframe preview to render');
    act(() => iframeProps.onIframeLoad());
};

const readyMetadata = () => ({
    state: 'ready' as const,
    version: 7,
    latestBuildInProgress: false,
    schema: {
        fields: [
            {
                name: 'category',
                label: 'Category',
                type: 'dimension' as const,
                required: true,
            },
        ],
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
        mocks.dataAppVizVersion.current = 7;
        mocks.setDataAppVizVersion.mockClear();
        mocks.iframePreview.mockClear();
        mocks.renderMetadataHook.mockClear();
        mocks.previewTokenHook.mockClear();
        mocks.setFetchAll.mockClear();
        mocks.canViewUnderlyingData.current = true;
        mocks.openUnderlyingDataModal.mockClear();
        mocks.metricQueryData.current = undefined;
        mocks.isLoading.current = false;
        mocks.explore.current = undefined;
        mocks.exploreHook.mockClear();
        mocks.vizContextOverrides.current = {};
        mocks.track.mockClear();
        mocks.trackingContext.current = { track: mocks.track };
    });

    it('prompts for a visualization when none is selected', () => {
        mocks.dataAppVizUuid.current = null;

        renderRenderer();

        expect(
            screen.getByText('Pick a custom chart type to render.'),
        ).toBeInTheDocument();
    });

    it('uses the standard chart loading overlay while render metadata is pending', () => {
        mocks.metadata.current = undefined;

        renderRenderer();

        expect(screen.getByText('Loading chart')).toBeInTheDocument();
        expect(mocks.iframePreview).not.toHaveBeenCalled();
    });

    it('uses the standard chart loading overlay while the preview token is pending', () => {
        mocks.token.current = undefined;

        renderRenderer();

        expect(screen.getByText('Loading chart')).toBeInTheDocument();
        expect(mocks.iframePreview).not.toHaveBeenCalled();
    });

    it('keeps the standard chart loading overlay until the app preview loads', () => {
        renderRenderer();
        const preview = screen.getByTestId('app-preview');

        expect(screen.getByText('Loading chart')).toBeInTheDocument();
        expect(preview.parentElement).toHaveAttribute('inert');

        loadIframe();

        expect(screen.queryByText('Loading chart')).not.toBeInTheDocument();
        expect(preview.parentElement).not.toHaveAttribute('inert');
    });

    it.each(['metadata', 'token'])(
        'waits for a remounted iframe after %s becomes pending',
        (pending) => {
            const view = renderRenderer();
            loadIframe();
            if (pending === 'metadata') mocks.metadata.current = undefined;
            else mocks.token.current = undefined;
            view.rerender(rendererElement());
            mocks.metadata.current = readyMetadata();
            mocks.token.current = 'preview-token';
            view.rerender(rendererElement());
            expect(screen.getByText('Loading chart')).toBeInTheDocument();
            loadIframe();
            expect(screen.queryByText('Loading chart')).not.toBeInTheDocument();
        },
    );

    it('keeps the app preview mounted under the standard loading overlay while query results refresh', () => {
        const view = renderRenderer();
        loadIframe();
        const preview = screen.getByTestId('app-preview');

        mocks.isLoading.current = true;
        view.rerender(rendererElement());

        expect(screen.getByText('Loading chart')).toBeInTheDocument();
        expect(screen.getByTestId('app-preview')).toBe(preview);
        expect(preview.parentElement).toHaveAttribute('inert');
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

    // A version that built fine and then lost its bundle is not a build
    // failure, and must not read like one.
    it('distinguishes an unavailable bundle from a build failure', () => {
        mocks.metadata.current = {
            state: 'unavailable',
            latestBuildInProgress: false,
        };

        renderRenderer();

        expect(
            screen.getByText(
                'The saved custom chart type version is unavailable.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Custom chart type failed to generate.'),
        ).not.toBeInTheDocument();
    });

    it('keeps the generic unavailable state for a legacy unpinned saved chart', () => {
        mocks.metadata.current = {
            state: 'unavailable',
            latestBuildInProgress: false,
        };
        mocks.dataAppVizVersion.current = undefined;

        renderRenderer();

        expect(
            screen.getByText('Custom chart type preview is unavailable.'),
        ).toBeInTheDocument();
    });

    it('keeps the generic unavailable state for an unsaved preview', () => {
        mocks.metadata.current = {
            state: 'unavailable',
            latestBuildInProgress: false,
        };
        mocks.vizContextOverrides.current = { savedChartUuid: undefined };

        renderRenderer();

        expect(
            screen.getByText('Custom chart type preview is unavailable.'),
        ).toBeInTheDocument();
    });

    it.each([
        ['metadata', 403, "You don't have access to this custom chart type."],
        ['token', 403, "You don't have access to this custom chart type."],
        [
            'metadata',
            404,
            'The chart type this chart was based on has been removed.',
        ],
        [
            'token',
            404,
            'The chart type this chart was based on has been removed.',
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

    it('offers view-mode recovery guidance with the removed message', () => {
        mocks.metadata.current = undefined;
        mocks.metadataError.current = apiError(404);

        renderRenderer();

        expect(
            screen.getByText(
                'Edit the chart to choose another chart type, or restore the chart type from Recently deleted.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit chart' }),
        ).toHaveAttribute(
            'href',
            '/projects/project-uuid/saved/saved-chart-uuid/edit?openVizConfig=true',
        );
    });

    it('points at Configure when the removed message shows in edit mode', () => {
        mocks.metadata.current = undefined;
        mocks.metadataError.current = apiError(404);
        mocks.vizContextOverrides.current = { isEditMode: true };

        renderRenderer();

        expect(
            screen.getByText(
                'Open Configure and choose another chart type, or restore the chart type from Recently deleted.',
            ),
        ).toBeInTheDocument();
        // Configure is adjacent in edit mode; no navigation link needed.
        expect(
            screen.queryByRole('link', { name: 'Edit chart' }),
        ).not.toBeInTheDocument();
    });

    it('keeps the removed message hint-free for embed viewers', () => {
        mocks.metadata.current = undefined;
        mocks.metadataError.current = apiError(404);
        mocks.embedToken.current = 'embed-token';

        renderRenderer();

        expect(
            screen.getByText(
                'The chart type this chart was based on has been removed.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/choose another chart type/),
        ).not.toBeInTheDocument();
    });

    it('keeps the no-access message hint-free', () => {
        mocks.metadata.current = undefined;
        mocks.metadataError.current = apiError(403);

        renderRenderer();

        expect(
            screen.queryByText(/choose another chart type/),
        ).not.toBeInTheDocument();
    });

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
                    seriesColors: {},
                    valueColors: {
                        orders_category: { Hardware: '#00ff00' },
                    },
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
            7,
        );
        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                src: 'https://preview.example.com/api/apps/viz-uuid/versions/7/t/preview-token/?r=0#transport=postMessage&projectUuid=project-uuid',
            }),
            undefined,
        );
    });

    it('refreshes the render binding when the saved chart is repinned', () => {
        const view = renderRenderer();

        mocks.dataAppVizVersion.current = 8;
        view.rerender(rendererElement());

        expect(mocks.renderMetadataHook).toHaveBeenLastCalledWith(
            'project-uuid',
            'viz-uuid',
            {
                isEmbedded: false,
                savedChartUuid: 'saved-chart-uuid',
            },
            8,
        );
    });

    it('pins an unsaved custom chart type without requiring an SDK capability announcement', () => {
        mocks.dataAppVizVersion.current = undefined;
        mocks.vizContextOverrides.current = {
            savedChartUuid: undefined,
            isEditMode: true,
        };

        renderRenderer();

        expect(mocks.setDataAppVizVersion).toHaveBeenCalledWith(7);
    });

    it('lazily pins a legacy saved chart when it is next edited', () => {
        mocks.dataAppVizVersion.current = undefined;
        mocks.vizContextOverrides.current = {
            savedChartUuid: undefined,
            isEditMode: true,
            savedChartReference: {
                uuid: 'saved-chart-uuid',
                chartConfig: {
                    type: 'data_app_viz',
                    config: {
                        dataAppVizUuid: 'viz-uuid',
                        fieldMapping: { category: 'orders.category' },
                    },
                },
            },
        };

        renderRenderer();

        expect(mocks.renderMetadataHook).toHaveBeenCalledWith(
            'project-uuid',
            'viz-uuid',
            {
                isEmbedded: false,
                savedChartUuid: 'saved-chart-uuid',
            },
            undefined,
        );
        expect(mocks.setDataAppVizVersion).toHaveBeenCalledWith(7);
    });

    it('keeps an unchanged edited chart on its persisted custom chart type version', () => {
        mocks.metadata.current = { ...readyMetadata(), version: 3 };
        mocks.dataAppVizVersion.current = 3;
        mocks.vizContextOverrides.current = {
            savedChartUuid: undefined,
            isEditMode: true,
            savedChartReference: {
                uuid: 'saved-chart-uuid',
                chartConfig: {
                    type: 'data_app_viz',
                    config: {
                        dataAppVizUuid: 'viz-uuid',
                        dataAppVizVersion: 3,
                        fieldMapping: { category: 'orders.category' },
                    },
                },
            },
        };

        renderRenderer();

        expect(mocks.renderMetadataHook).toHaveBeenCalledWith(
            'project-uuid',
            'viz-uuid',
            {
                isEmbedded: false,
                savedChartUuid: 'saved-chart-uuid',
            },
            3,
        );

        expect(mocks.setDataAppVizVersion).not.toHaveBeenCalled();
    });

    it('renders an upgraded pin through the authoring path without re-pinning', () => {
        mocks.metadata.current = { ...readyMetadata(), version: 5 };
        mocks.dataAppVizVersion.current = 5;
        mocks.vizContextOverrides.current = {
            savedChartUuid: undefined,
            isEditMode: true,
            savedChartReference: {
                uuid: 'saved-chart-uuid',
                chartConfig: {
                    type: 'data_app_viz',
                    config: {
                        dataAppVizUuid: 'viz-uuid',
                        dataAppVizVersion: 3,
                        fieldMapping: { category: 'orders.category' },
                    },
                },
            },
        };

        renderRenderer();

        expect(mocks.renderMetadataHook).toHaveBeenCalledWith(
            'project-uuid',
            'viz-uuid',
            {
                isEmbedded: false,
                savedChartUuid: undefined,
            },
            undefined,
        );
        expect(mocks.setDataAppVizVersion).not.toHaveBeenCalled();
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
            7,
        );
    });
});

describe('DataAppVizRenderer screenshot-ready contract', () => {
    const lastIframeProps = () =>
        (
            mocks.iframePreview.mock.calls.at(-1) as unknown[] | undefined
        )?.[0] as {
            onScreenshotAvailabilityChange?: (available: boolean) => void;
            onSdkManifest?: (manifest: {
                sdkVersion: string;
                features: string[];
            }) => void;
            onVizRendered?: (renderId: string) => void;
            dataAppVizRenderId?: string;
        };

    const announceScreenshotAvailable = () => {
        act(() => {
            lastIframeProps().onScreenshotAvailabilityChange?.(true);
        });
    };

    const announceCurrentSdk = () => {
        act(() => {
            lastIframeProps().onSdkManifest?.({
                sdkVersion: '2.234.0',
                features: ['viz-rendered'],
            });
        });
    };

    const announceLegacySdk = () => {
        act(() => {
            lastIframeProps().onSdkManifest?.({
                sdkVersion: '2.200.0',
                features: [],
            });
        });
    };

    const announceVizRendered = (renderId?: string) => {
        act(() => {
            const id = renderId ?? lastIframeProps().dataAppVizRenderId;
            if (!id) throw new Error('Expected a render id');
            lastIframeProps().onVizRendered?.(id);
        });
    };

    beforeEach(() => {
        mocks.metadata.current = readyMetadata();
        mocks.metadataError.current = undefined;
        mocks.token.current = 'preview-token';
        mocks.tokenError.current = undefined;
        mocks.embedToken.current = undefined;
        mocks.dataAppVizUuid.current = 'viz-uuid';
        mocks.iframePreview.mockClear();
        mocks.isLoading.current = false;
        mocks.canViewUnderlyingData.current = true;
        mocks.explore.current = undefined;
        mocks.vizContextOverrides.current = {};
        mocks.trackingContext.current = { track: mocks.track };
    });

    it('waits for the current context to paint after the SDK announces before signaling screenshot readiness', () => {
        const onScreenshotReady = vi.fn();

        renderRenderer({ onScreenshotReady });

        expect(onScreenshotReady).not.toHaveBeenCalled();

        announceScreenshotAvailable();
        expect(onScreenshotReady).not.toHaveBeenCalled();
        loadIframe();

        announceCurrentSdk();
        expect(onScreenshotReady).not.toHaveBeenCalled();

        announceVizRendered();

        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('does not accept a stale paint acknowledgement after the host pushes new context', () => {
        const onScreenshotReady = vi.fn();
        const view = renderRenderer({ onScreenshotReady });
        loadIframe();
        announceCurrentSdk();
        const staleRenderId = lastIframeProps().dataAppVizRenderId;
        expect(staleRenderId).toBeDefined();

        expect(onScreenshotReady).not.toHaveBeenCalled();

        mocks.vizContextOverrides.current = { colorPalette: ['#ff0000'] };
        view.rerender(rendererElement({ onScreenshotReady }));
        const currentRenderId = lastIframeProps().dataAppVizRenderId;
        expect(currentRenderId).not.toBe(staleRenderId);

        announceVizRendered(staleRenderId);
        expect(onScreenshotReady).not.toHaveBeenCalled();

        announceVizRendered(currentRenderId);
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('keeps a render id when an equivalent context is reallocated', () => {
        const onScreenshotReady = vi.fn();
        const view = renderRenderer({ onScreenshotReady });
        loadIframe();
        announceCurrentSdk();
        const renderId = lastIframeProps().dataAppVizRenderId;

        mocks.vizContextOverrides.current = { colorPalette: ['#7162FF'] };
        view.rerender(rendererElement({ onScreenshotReady }));

        expect(lastIframeProps().dataAppVizRenderId).toBe(renderId);
        announceVizRendered(renderId);
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('requires a fresh post-paint acknowledgement after the iframe reloads', () => {
        const onScreenshotReady = vi.fn();
        const view = renderRenderer({ onScreenshotReady });
        loadIframe();
        announceCurrentSdk();
        const previousRenderId = lastIframeProps().dataAppVizRenderId;

        mocks.metadata.current = { ...readyMetadata(), version: 8 };
        view.rerender(rendererElement({ onScreenshotReady }));
        loadIframe();
        announceCurrentSdk();
        const currentRenderId = lastIframeProps().dataAppVizRenderId;

        expect(currentRenderId).not.toBe(previousRenderId);
        announceVizRendered(previousRenderId);
        expect(onScreenshotReady).not.toHaveBeenCalled();

        announceVizRendered(currentRenderId);
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('uses the painted context once its host query has finished loading', () => {
        const onScreenshotReady = vi.fn();
        mocks.isLoading.current = true;
        const view = renderRenderer({ onScreenshotReady });
        loadIframe();
        announceCurrentSdk();
        announceVizRendered();
        expect(onScreenshotReady).not.toHaveBeenCalled();
        mocks.isLoading.current = false;
        view.rerender(rendererElement({ onScreenshotReady }));
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('signals after the fallback timeout only when a silent bundle is classified legacy', () => {
        vi.useFakeTimers();
        try {
            const onScreenshotReady = vi.fn();

            renderRenderer({ onScreenshotReady });
            loadIframe();

            void act(() =>
                vi.advanceTimersByTime(SCREENSHOT_READY_FALLBACK_MS - 1),
            );
            expect(onScreenshotReady).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(onScreenshotReady).toHaveBeenCalledTimes(1);

            // A late announce must not fire the callback a second time.
            announceScreenshotAvailable();
            expect(onScreenshotReady).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps an immediately identified legacy bundle on the same fallback deadline', () => {
        vi.useFakeTimers();
        try {
            const onScreenshotReady = vi.fn();
            renderRenderer({ onScreenshotReady });
            announceLegacySdk();
            loadIframe();

            void act(() =>
                vi.advanceTimersByTime(SCREENSHOT_READY_FALLBACK_MS - 1),
            );
            expect(onScreenshotReady).not.toHaveBeenCalled();

            void act(() => vi.advanceTimersByTime(1));
            expect(onScreenshotReady).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('re-renders with a new callback identity do not reset the fallback timeout', () => {
        vi.useFakeTimers();
        try {
            const first = vi.fn();
            const view = renderRenderer({ onScreenshotReady: first });
            loadIframe();

            act(() => {
                vi.advanceTimersByTime(SCREENSHOT_READY_FALLBACK_MS - 1000);
            });
            const second = vi.fn();
            view.rerender(rendererElement({ onScreenshotReady: second }));
            act(() => {
                vi.advanceTimersByTime(1000);
            });

            expect(second).toHaveBeenCalledTimes(1);
            expect(first).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    // Terminal placeholders never mount the iframe — waiting on the announce
    // or the fallback would stall delivery for an already-final frame.
    it.each([
        [
            'no viz selected',
            () => {
                mocks.dataAppVizUuid.current = null;
            },
        ],
        [
            'metadata failed state',
            () => {
                mocks.metadata.current = {
                    state: 'failed',
                    latestBuildInProgress: false,
                };
            },
        ],
        [
            'metadata building state',
            () => {
                mocks.metadata.current = {
                    state: 'building',
                    latestBuildInProgress: true,
                };
            },
        ],
        [
            'metadata unavailable state',
            () => {
                mocks.metadata.current = {
                    state: 'unavailable',
                    latestBuildInProgress: false,
                };
            },
        ],
        [
            'terminal 403 on metadata',
            () => {
                mocks.metadata.current = undefined;
                mocks.metadataError.current = apiError(403);
            },
        ],
    ])('%s: signals ready for the placeholder frame', (_label, arrange) => {
        const onScreenshotReady = vi.fn();
        arrange();

        renderRenderer({ onScreenshotReady });

        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('does not treat a pending metadata fetch as a terminal placeholder', () => {
        const onScreenshotReady = vi.fn();
        mocks.metadata.current = undefined;

        renderRenderer({ onScreenshotReady });

        expect(onScreenshotReady).not.toHaveBeenCalled();
    });

    it('signals ready when a pending render-metadata request settles with a generic error', () => {
        const onScreenshotReady = vi.fn();
        mocks.metadata.current = undefined;
        const view = renderRenderer({ onScreenshotReady });
        expect(onScreenshotReady).not.toHaveBeenCalled();

        mocks.metadataError.current = apiError(500);
        view.rerender(rendererElement({ onScreenshotReady }));

        expect(
            screen.getByText('Custom chart type could not be loaded.'),
        ).toBeInTheDocument();
        expect(mocks.iframePreview).not.toHaveBeenCalled();
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('signals ready when a pending preview-token request settles with a generic error', () => {
        const onScreenshotReady = vi.fn();
        mocks.token.current = undefined;
        const view = renderRenderer({ onScreenshotReady });
        expect(onScreenshotReady).not.toHaveBeenCalled();

        mocks.tokenError.current = apiError(500);
        view.rerender(rendererElement({ onScreenshotReady }));

        expect(
            screen.getByText('Custom chart type could not be loaded.'),
        ).toBeInTheDocument();
        expect(mocks.iframePreview).not.toHaveBeenCalled();
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });
});

describe('DataAppVizRenderer underlying-data gating', () => {
    const happyMetricQuery = {
        exploreName: 'orders',
        dimensions: ['orders_category'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    };
    const happyResultsData = () => ({
        rows: [{ 'orders.category': { value: { raw: 'Hardware' } } }],
        setFetchAll: mocks.setFetchAll,
        metricQuery: happyMetricQuery,
        queryUuid: 'source-query-uuid',
    });

    const binDimension = {
        id: 'bin1',
        name: 'amount_bin',
        table: 'orders',
        type: 'bin',
        dimensionId: 'orders_amount',
        binType: 'fixed_number',
        binNumber: 5,
    };

    const lastIframeProps = () =>
        (
            mocks.iframePreview.mock.calls.at(-1) as unknown[] | undefined
        )?.[0] as {
            dataAppVizContext?: {
                pivotDetails: unknown;
                underlyingData: {
                    enabled: boolean;
                    openEnabled?: boolean;
                };
            };
            rewriteVizUnderlyingDataRequest?: (intent: unknown) => unknown;
            onVizUnderlyingDataIntent?: (intent: unknown) => void;
        };

    beforeEach(() => {
        mocks.metadata.current = {
            ...readyMetadata(),
            schema: {
                ...readyMetadata().schema,
                fields: [
                    ...readyMetadata().schema.fields,
                    {
                        name: 'value',
                        label: 'Value',
                        type: 'metric' as const,
                        required: true,
                    },
                ],
            },
        };
        mocks.metadataError.current = undefined;
        mocks.token.current = 'preview-token';
        mocks.tokenError.current = undefined;
        mocks.embedToken.current = undefined;
        mocks.dataAppVizUuid.current = 'viz-uuid';
        mocks.iframePreview.mockClear();
        mocks.exploreHook.mockClear();
        mocks.canViewUnderlyingData.current = true;
        mocks.openUnderlyingDataModal.mockClear();
        mocks.metricQueryData.current = {
            openUnderlyingDataModal: mocks.openUnderlyingDataModal,
        };
        mocks.explore.current = { name: 'orders' };
        mocks.vizContextOverrides.current = { resultsData: happyResultsData() };
        mocks.track.mockClear();
        mocks.trackingContext.current = { track: mocks.track };
    });

    it('happy path: pushes enabled and installs the rewrite callback', () => {
        renderRenderer();
        const props = lastIframeProps();
        expect(props.dataAppVizContext?.underlyingData).toEqual({
            enabled: true,
            openEnabled: true,
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeTypeOf('function');
        expect(props.onVizUnderlyingDataIntent).toBeTypeOf('function');
    });

    it('opens the host underlying-data modal from a viz intent', () => {
        renderRenderer();

        act(() => {
            lastIframeProps().onVizUnderlyingDataIntent?.({
                row: {
                    orders_category: {
                        value: { raw: 'Hardware', formatted: 'Hardware' },
                    },
                    orders_count: {
                        value: { raw: 12, formatted: '12' },
                    },
                },
                metric: 'value',
            });
        });

        expect(mocks.openUnderlyingDataModal).toHaveBeenCalledWith({
            item: expect.objectContaining({
                fieldType: FieldType.METRIC,
                name: 'count',
            }),
            value: { raw: 12, formatted: '12' },
            fieldValues: {
                orders_category: { raw: 'Hardware', formatted: 'Hardware' },
                orders_count: { raw: 12, formatted: '12' },
            },
        });
        expect(mocks.track).toHaveBeenCalledWith({
            name: 'view_underlying_data.clicked',
            properties: {
                organizationId: 'organization-uuid',
                userId: 'user-uuid',
                projectId: 'project-uuid',
            },
        });
    });

    it('keeps legacy fetching enabled when the host modal provider is absent', () => {
        mocks.metricQueryData.current = undefined;

        renderRenderer();

        const props = lastIframeProps();
        expect(props.dataAppVizContext?.underlyingData).toEqual({
            enabled: true,
            openEnabled: false,
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeTypeOf('function');
        expect(props.onVizUnderlyingDataIntent).toBeUndefined();
    });

    it('forwards pivot metadata and disables underlying data for pivoted rows', () => {
        const pivotDetails = {
            indexColumn: [],
            valuesColumns: [],
            groupByColumns: [{ reference: 'orders_status' }],
        };
        mocks.vizContextOverrides.current = {
            resultsData: { ...happyResultsData(), pivotDetails },
        };

        renderRenderer();

        const props = lastIframeProps();
        expect(props.dataAppVizContext?.pivotDetails).toBe(pivotDetails);
        expect(props.dataAppVizContext?.underlyingData).toEqual({
            enabled: false,
            openEnabled: false,
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeUndefined();
        expect(props.onVizUnderlyingDataIntent).toBeUndefined();
    });

    it.each([
        [
            'permission denied',
            () => {
                mocks.canViewUnderlyingData.current = false;
            },
        ],
        [
            'embed context',
            () => {
                mocks.embedToken.current = 'embed-jwt';
            },
        ],
        [
            'minimal (screenshot) render',
            () => {
                mocks.vizContextOverrides.current = {
                    resultsData: happyResultsData(),
                    minimal: true,
                };
                // /minimal routes at desktop viewports mount no
                // TrackingProvider — exercise the real fail-silent path
                // rather than masking it with a working mock.
                mocks.trackingContext.current = undefined;
            },
        ],
        [
            'no source query uuid',
            () => {
                mocks.vizContextOverrides.current = {
                    resultsData: {
                        ...happyResultsData(),
                        queryUuid: undefined,
                    },
                };
            },
        ],
        [
            'custom bin dimension in the query',
            () => {
                mocks.vizContextOverrides.current = {
                    resultsData: {
                        ...happyResultsData(),
                        metricQuery: {
                            ...happyMetricQuery,
                            customDimensions: [binDimension],
                        },
                    },
                };
            },
        ],
        [
            'explore not loaded',
            () => {
                mocks.explore.current = undefined;
            },
        ],
    ])('%s: pushes disabled and installs no callback', (_label, arrange) => {
        arrange();
        renderRenderer();
        const props = lastIframeProps();
        expect(props.dataAppVizContext?.underlyingData).toEqual({
            enabled: false,
            openEnabled: false,
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeUndefined();
        expect(props.onVizUnderlyingDataIntent).toBeUndefined();
    });

    it('gated surfaces disable the explore fetch itself', () => {
        mocks.embedToken.current = 'embed-jwt';
        renderRenderer();
        expect(mocks.exploreHook).toHaveBeenLastCalledWith(
            'orders',
            expect.objectContaining({ enabled: false }),
        );
    });

    it('the happy path enables the explore fetch', () => {
        renderRenderer();
        expect(mocks.exploreHook).toHaveBeenLastCalledWith(
            'orders',
            expect.objectContaining({ enabled: true }),
        );
    });
});
