import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';

const hooks = vi.hoisted(() => ({
    metadata: vi.fn(),
    token: vi.fn(),
}));

vi.mock('../../../hooks/appearance/useResolvedColorPalette', () => ({
    useResolvedColorPalette: () => undefined,
}));
vi.mock('../../../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 0, height: 0 }],
}));
vi.mock('../../apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'http://preview.test',
}));
vi.mock('../hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: hooks.metadata,
    useDataAppVizPreviewToken: hooks.token,
}));

const apiError = (statusCode: number) => ({
    status: 'error' as const,
    error: { name: 'ApiError', statusCode, message: 'Failed', data: {} },
});

const metadata = {
    state: 'ready' as const,
    version: 1,
    schema: { fields: [], configOptions: [], colorPalette: null },
};

describe('ChartTypeSamplePreview', () => {
    it.each([
        [
            'keeps cached metadata through a transient error',
            apiError(500),
            null,
            false,
        ],
        ['surfaces terminal metadata errors', apiError(403), null, true],
        [
            'keeps cached tokens through a transient error',
            null,
            apiError(500),
            false,
        ],
        ['surfaces terminal token errors', null, apiError(404), true],
    ])('%s', (_label, metadataError, tokenError, unavailable) => {
        hooks.metadata.mockReturnValue({
            data: metadata,
            error: metadataError,
        });
        hooks.token.mockReturnValue({ data: 'token', error: tokenError });
        const onPreviewUnavailable = vi.fn();

        renderWithProviders(
            <ChartTypeSamplePreview
                projectUuid="project-1"
                dataAppVizUuid="viz-1"
                icon={null}
                onPreviewUnavailable={onPreviewUnavailable}
            />,
        );

        expect(onPreviewUnavailable).toHaveBeenCalledTimes(unavailable ? 1 : 0);
    });
});
