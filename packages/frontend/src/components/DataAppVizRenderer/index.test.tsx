import { DimensionType, FieldType } from '@lightdash/common';
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
                          type: 'dimension';
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
        }) => null,
    ),
    renderMetadataHook: vi.fn(),
    previewTokenHook: vi.fn(),
    setFetchAll: vi.fn(),
    canViewUnderlyingData: { current: true },
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
        },
        colorPalette: ['#7162FF'],
        ...mocks.vizContextOverrides.current,
    }),
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

const announceIframeAvailable = () => {
    const iframeProps = mocks.iframePreview.mock.lastCall?.[0];
    if (!iframeProps) throw new Error('Expected the iframe preview to render');
    act(() => iframeProps.onScreenshotAvailabilityChange(true));
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
        );
        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                src: 'https://preview.example.com/api/apps/viz-uuid/versions/7/t/preview-token/?r=0#transport=postMessage&projectUuid=project-uuid',
            }),
            undefined,
        );
    });

    it('pins an unsaved project chart type without requiring an SDK capability announcement', () => {
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
        );
        expect(mocks.setDataAppVizVersion).toHaveBeenCalledWith(7);
    });

    it('keeps an unchanged edited chart on its persisted project chart type version', () => {
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
        );

        announceIframeAvailable();

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
        );
    });
});

describe('DataAppVizRenderer screenshot-ready contract', () => {
    const lastIframeProps = () =>
        (
            mocks.iframePreview.mock.calls.at(-1) as unknown[] | undefined
        )?.[0] as {
            onScreenshotAvailabilityChange?: (available: boolean) => void;
        };

    const announceScreenshotAvailable = () => {
        act(() => {
            lastIframeProps().onScreenshotAvailabilityChange?.(true);
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
        mocks.canViewUnderlyingData.current = true;
        mocks.explore.current = undefined;
        mocks.vizContextOverrides.current = {};
        mocks.trackingContext.current = { track: mocks.track };
    });

    it('does not signal ready on mount, and signals once the iframe announces with context delivered', () => {
        const onScreenshotReady = vi.fn();

        renderRenderer({ onScreenshotReady });

        expect(onScreenshotReady).not.toHaveBeenCalled();

        announceScreenshotAvailable();

        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('does not signal on announce while the viz context is missing, then signals once it arrives', () => {
        const onScreenshotReady = vi.fn();
        mocks.vizContextOverrides.current = {
            resultsData: { rows: undefined, setFetchAll: mocks.setFetchAll },
        };

        const view = renderRenderer({ onScreenshotReady });
        announceScreenshotAvailable();

        expect(onScreenshotReady).not.toHaveBeenCalled();

        mocks.vizContextOverrides.current = {};
        view.rerender(rendererElement({ onScreenshotReady }));

        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
    });

    it('signals after the fallback timeout when the sandbox never announces', () => {
        vi.useFakeTimers();
        try {
            const onScreenshotReady = vi.fn();

            renderRenderer({ onScreenshotReady });

            act(() => {
                vi.advanceTimersByTime(SCREENSHOT_READY_FALLBACK_MS - 1);
            });
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

    it('re-renders with a new callback identity do not reset the fallback timeout', () => {
        vi.useFakeTimers();
        try {
            const first = vi.fn();
            const view = renderRenderer({ onScreenshotReady: first });

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
                underlyingData: { enabled: boolean };
            };
            rewriteVizUnderlyingDataRequest?: (intent: unknown) => unknown;
        };

    beforeEach(() => {
        mocks.metadata.current = readyMetadata();
        mocks.metadataError.current = undefined;
        mocks.token.current = 'preview-token';
        mocks.tokenError.current = undefined;
        mocks.embedToken.current = undefined;
        mocks.dataAppVizUuid.current = 'viz-uuid';
        mocks.iframePreview.mockClear();
        mocks.exploreHook.mockClear();
        mocks.canViewUnderlyingData.current = true;
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
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeTypeOf('function');
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
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeUndefined();
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
        });
        expect(props.rewriteVizUnderlyingDataRequest).toBeUndefined();
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
