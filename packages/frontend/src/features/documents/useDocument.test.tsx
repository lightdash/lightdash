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
            ({ versionUuid, cellIndex }) =>
                useDocumentCellQuery(
                    'project',
                    'document',
                    versionUuid,
                    cellIndex,
                ),
            {
                wrapper,
                initialProps: { versionUuid: 'v1', cellIndex: 0 },
            },
        );
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v1'));
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/documents/document/cells/0/query',
            body: JSON.stringify({ versionUuid: 'v1' }),
            signal: expect.any(AbortSignal),
        });
        rerender({ versionUuid: 'v2', cellIndex: 0 });
        await waitFor(() => expect(result.current.data?.queryUuid).toBe('v2'));
        rerender({ versionUuid: 'v2', cellIndex: 1 });
        await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
        expect(api).toHaveBeenLastCalledWith({
            method: 'POST',
            url: '/projects/project/documents/document/cells/1/query',
            body: JSON.stringify({ versionUuid: 'v2' }),
            signal: expect.any(AbortSignal),
        });
        expect(
            client.getQueryData([
                'document-cell-query',
                'project',
                'document',
                'v1',
                0,
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
            () => useDocumentCellQuery('project', 'document', 'old-version', 0),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toEqual(error);
        expect(api).toHaveBeenCalledTimes(1);
        client.clear();
    });
});
