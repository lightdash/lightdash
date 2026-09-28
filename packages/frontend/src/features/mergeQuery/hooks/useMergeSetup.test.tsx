import { ChartType } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMergeSetup } from './useMergeSetup';

const mocks = vi.hoisted(() => ({
    metadata: vi.fn(),
    selectors: new Map<string, unknown>(),
}));

vi.mock('../../chartTypes/hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: mocks.metadata,
}));
vi.mock('../../explorer/store', () => ({
    selectTableName: 'tableName',
    selectMetricQuery: 'metricQuery',
    selectParameters: 'parameters',
    selectUnsavedChartVersion: 'unsavedChartVersion',
    selectSavedChart: 'savedChart',
    selectIsEditMode: 'isEditMode',
    useExplorerSelector: (selector: string) => mocks.selectors.get(selector),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));
vi.mock('../../apps/ChartVersionPreview/useChartVersionPreview', () => ({
    useChartVersionPreview: () => undefined,
}));
vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('../context/useMerge', () => ({
    useMergeSafe: () => null,
}));

describe('useMergeSetup metadata gate', () => {
    beforeEach(() => {
        mocks.selectors.set('tableName', 'orders');
        mocks.selectors.set('metricQuery', {
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            tableCalculations: [],
            limit: 100,
        });
        mocks.selectors.set('parameters', {});
        mocks.selectors.set('savedChart', undefined);
        mocks.selectors.set('unsavedChartVersion', {
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: { dataAppVizUuid: 'viz-1' },
            },
        });
    });

    it.each([
        { data: { state: 'failed' } },
        { data: { state: 'unavailable' } },
        { error: new Error('Metadata request failed') },
    ])('treats %j as terminal', (metadata) => {
        mocks.metadata.mockReturnValue(metadata);

        const { result } = renderHook(() => useMergeSetup());

        expect(result.current.hierarchyMetadataError).toBe(true);
        expect(result.current.blockingReason).toMatch(
            /metadata could not be loaded/i,
        );
        expect(result.current.unsupportedHierarchy).toBe(false);
    });

    it('keeps legacy metadata without a hierarchy runnable', () => {
        mocks.metadata.mockReturnValue({
            data: { state: 'ready', schema: { hierarchy: null } },
        });

        const { result } = renderHook(() => useMergeSetup());

        expect(result.current.hierarchyMetadataError).toBe(false);
        expect(result.current.unsupportedHierarchy).toBe(false);
    });
});
