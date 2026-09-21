import { type DataAppVizPreviewSelectionInput } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useApp from '../../../providers/App/useApp';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useRememberPreviewSelection } from './useRememberPreviewSelection';

const lightdashApi = vi.hoisted(() => vi.fn());
vi.mock('../../../api', () => ({ lightdashApi }));
const showToastApiError = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError, showToastSuccess: vi.fn() }),
}));

const selection: DataAppVizPreviewSelectionInput = {
    exploreName: 'customers',
    savedChart: null,
    metricQuery: {
        exploreName: 'customers',
        dimensions: ['customers_channel'],
        metrics: ['customers_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: null,
        customDimensions: null,
    },
    fieldMapping: { source: 'customers_channel', value: 'customers_count' },
};

const renderRemember = (
    options: { appUuid?: string | null; enabled?: boolean } = {},
) =>
    renderHookWithProviders(() => ({
        queryClient: useQueryClient(),
        userUuid: useApp().user.data?.userUuid,
        remember: useRememberPreviewSelection({
            projectUuid: 'p1',
            appUuid: options.appUuid === undefined ? 'viz-1' : options.appUuid,
            appUuidOrSlug: 'stream-graph',
            enabled: options.enabled ?? true,
        }),
    }));

describe('useRememberPreviewSelection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lightdashApi.mockResolvedValue(undefined);
    });

    it('sends the selection and nothing else', async () => {
        const { result } = renderRemember();

        act(() => result.current.remember(selection));

        await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
        const request = lightdashApi.mock.calls[0][0];
        expect(request.method).toBe('PUT');
        expect(request.url).toBe(
            '/ee/projects/p1/apps/viz-1/preview-selection',
        );
        const body = JSON.parse(request.body);
        expect(Object.keys(body)).toEqual(['selection']);
        expect(Object.keys(body.selection)).toEqual([
            'exploreName',
            'savedChart',
            'metricQuery',
            'fieldMapping',
        ]);
        expect(Object.keys(body.selection.metricQuery)).toEqual([
            'exploreName',
            'dimensions',
            'metrics',
            'filters',
            'sorts',
            'limit',
            'tableCalculations',
            'additionalMetrics',
            'customDimensions',
        ]);
    });

    it('writes the remembered selection into the cached chart type', async () => {
        const { result } = renderRemember();
        await waitFor(() => expect(result.current.userUuid).toBeTruthy());
        result.current.queryClient.setQueryData(['app', 'p1', 'viz-1'], {
            pages: [{ appUuid: 'viz-1', previewSelection: null }],
            pageParams: [undefined],
        });

        act(() => result.current.remember(selection));

        await waitFor(() =>
            expect(
                result.current.queryClient.getQueryData(['app', 'p1', 'viz-1']),
            ).toEqual({
                pages: [
                    {
                        appUuid: 'viz-1',
                        previewSelection: {
                            version: 1,
                            ...selection,
                            updatedAt: expect.any(Date),
                            updatedByUserUuid: expect.any(String),
                        },
                    },
                ],
                pageParams: [undefined],
            }),
        );
    });

    it('says nothing when the server refuses the write', async () => {
        lightdashApi.mockRejectedValue({
            error: { statusCode: 403, message: 'Forbidden' },
        });
        const { result } = renderRemember();

        act(() => result.current.remember(selection));

        await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
        expect(showToastApiError).not.toHaveBeenCalled();
    });

    it.each([
        ['a chart type this user cannot edit', { enabled: false }],
        ['a chart type that does not exist yet', { appUuid: null }],
    ])('remembers nothing for %s', (_case, options) => {
        const { result } = renderRemember(options);

        act(() => result.current.remember(selection));

        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
