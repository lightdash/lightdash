import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    dataAppViz: {
        current: undefined as
            | {
                  schema: {
                      configOptions: Array<{
                          type: 'text';
                          name: string;
                          label: string;
                          default: string;
                      }>;
                  };
              }
            | undefined,
    },
    iframePreview: vi.fn(() => null),
    setFetchAll: vi.fn(),
}));

vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: 'project-uuid' }),
}));
vi.mock('../../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));
vi.mock('../../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({ data: 'preview-token' }),
}));
vi.mock('../../features/apps/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: () => ({ data: mocks.dataAppViz.current }),
}));
vi.mock('../../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: {
            pages: [{ versions: [{ status: 'ready', version: 1 }] }],
        },
    }),
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
        resultsData: {
            rows: [{ 'orders.category': { value: { raw: 'Hardware' } } }],
            setFetchAll: mocks.setFetchAll,
        },
    }),
}));

import DataAppVizRenderer from './index';

describe('DataAppVizRenderer option delivery', () => {
    beforeEach(() => {
        mocks.dataAppViz.current = undefined;
        mocks.iframePreview.mockClear();
        mocks.setFetchAll.mockClear();
    });

    it('does not push stale stored options before the declaration resolves', () => {
        const { rerender } = render(<DataAppVizRenderer />);

        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({ dataAppVizContext: undefined }),
            undefined,
        );

        mocks.dataAppViz.current = {
            schema: {
                configOptions: [
                    {
                        type: 'text',
                        name: 'title',
                        label: 'Title',
                        default: 'Sales',
                    },
                ],
            },
        };
        rerender(<DataAppVizRenderer />);

        expect(mocks.iframePreview).toHaveBeenLastCalledWith(
            expect.objectContaining({
                dataAppVizContext: expect.objectContaining({
                    options: { title: 'Sales' },
                }),
            }),
            undefined,
        );
    });
});
