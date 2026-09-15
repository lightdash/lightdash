import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useDocumentCellQuery } from './useDocument';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({ lightdashApi: api }));

describe('saved Document cell query', () => {
    beforeEach(() => {
        api.mockReset();
    });

    it('submits only the persisted version and scopes cached results to each cell/version', async () => {
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
            ({ versionUuid, cellId }) =>
                useDocumentCellQuery(
                    'project',
                    'document',
                    versionUuid,
                    cellId,
                ),
            {
                wrapper,
                initialProps: { versionUuid: 'v1', cellId: 'chart / one' },
            },
        );
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v1'));
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/documents/document/cells/chart%20%2F%20one/query',
            body: JSON.stringify({ versionUuid: 'v1' }),
            signal: expect.any(AbortSignal),
        });
        rerender({ versionUuid: 'v2', cellId: 'chart / one' });
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v2'));
        rerender({ versionUuid: 'v2', cellId: 'another-cell' });
        await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
        expect(
            client.getQueryData([
                'document-cell-query',
                'project',
                'document',
                'v1',
                'chart / one',
            ]),
        ).toEqual({ queryUuid: 'v1' });
        client.clear();
    });

    it('does not retry a rejected saved-cell execution', async () => {
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
                useDocumentCellQuery(
                    'project',
                    'document',
                    'old-version',
                    'cell',
                ),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toEqual(error);
        expect(api).toHaveBeenCalledTimes(1);
        client.clear();
    });
});
