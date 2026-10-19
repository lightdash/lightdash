import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { useDocumentChartQuery } from './useDocument';

const api = mockedLightdashApi;
vi.mock('../../api');

describe('saved Document chart query', () => {
    beforeEach(() => {
        api.mockReset();
    });

    it('submits only the persisted version and scopes cached results to each chart/version', async () => {
        api.mockImplementation(async ({ body }: { body: string }) => ({
            queryUuid: JSON.parse(body).versionUuid,
        }));
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
        const { result, rerender } = renderHook(
            ({ versionUuid, chartId }) =>
                useDocumentChartQuery(
                    'project',
                    'document',
                    versionUuid,
                    chartId,
                ),
            {
                wrapper,
                initialProps: { versionUuid: 'v1', chartId: 'c1' },
            },
        );
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v1'));
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/documents/document/charts/c1/query',
            body: JSON.stringify({ versionUuid: 'v1' }),
            signal: expect.any(AbortSignal),
        });
        rerender({ versionUuid: 'v2', chartId: 'c1' });
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v2'));
        rerender({ versionUuid: 'v2', chartId: 'c2' });
        await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
        expect(api).toHaveBeenLastCalledWith({
            method: 'POST',
            url: '/projects/project/documents/document/charts/c2/query',
            body: JSON.stringify({ versionUuid: 'v2' }),
            signal: expect.any(AbortSignal),
        });
        expect(
            client.getQueryData([
                'document-chart-query',
                'project',
                'document',
                'v1',
                'c1',
            ]),
        ).toEqual({ queryUuid: 'v1' });
        client.clear();
    });

    it('does not retry a rejected saved-chart execution', async () => {
        const error = {
            status: 'error',
            error: { message: 'Document changed', statusCode: 409 },
        };
        api.mockRejectedValue(error);
        const client = new QueryClient();
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () =>
                useDocumentChartQuery(
                    'project',
                    'document',
                    'old-version',
                    'c1',
                ),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toEqual(error);
        expect(api).toHaveBeenCalledTimes(1);
        client.clear();
    });
});
