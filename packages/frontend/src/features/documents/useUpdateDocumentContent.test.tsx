import { type UpdateDocumentContentRequest } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useUpdateDocumentContent } from './useUpdateDocumentContent';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({ lightdashApi: api }));

const request: UpdateDocumentContentRequest = {
    baseVersionUuid: 'version-1',
    content: {
        cells: [{ type: 'markdown', content: { markdown: '# Updated' } }],
    },
};
const original = {
    documentUuid: 'document',
    slug: 'report',
    version: { versionUuid: 'version-1', content: { cells: [] } },
};
const saved = {
    ...original,
    version: { versionUuid: 'version-2', content: request.content },
};

describe('Document content mutation', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        api.mockReset();
    });
    afterEach(() => {
        clients.forEach((client) => client.clear());
        clients.length = 0;
    });

    const renderMutation = () => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
            logger: { log: console.log, warn: console.warn, error: vi.fn() },
        });
        clients.push(client);
        client.setQueryData(['document', 'project', 'document'], original);
        client.setQueryData(['document', 'project', 'report'], original);
        client.setQueryData(['document', 'other-project', 'report'], original);
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
        return {
            client,
            ...renderHook(
                () => useUpdateDocumentContent('project', 'document'),
                { wrapper },
            ),
        };
    };

    it('posts full content with the base version and updates both UUID and slug caches', async () => {
        api.mockResolvedValue(saved);
        const { client, result } = renderMutation();
        const before = structuredClone(request);
        await act(async () => {
            await result.current.mutateAsync(request);
        });
        expect(api).toHaveBeenCalledExactlyOnceWith({
            url: '/projects/project/documents/document/versions',
            method: 'POST',
            body: JSON.stringify(request),
        });
        expect(
            client.getQueryData(['document', 'project', 'document']),
        ).toEqual(saved);
        expect(client.getQueryData(['document', 'project', 'report'])).toEqual(
            saved,
        );
        expect(
            client.getQueryData(['document', 'other-project', 'report']),
        ).toEqual(original);
        expect(
            client.getQueryState(['document', 'project', 'document'])
                ?.isInvalidated,
        ).toBe(true);
        expect(request).toEqual(before);
    });

    it('preserves cached content when a stale base version conflicts', async () => {
        const conflict = {
            status: 'error',
            error: { statusCode: 409, message: 'Document has changed' },
        };
        api.mockRejectedValue(conflict);
        const { client, result } = renderMutation();
        await act(async () => {
            await expect(result.current.mutateAsync(request)).rejects.toEqual(
                conflict,
            );
        });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toEqual(conflict);
        expect(api).toHaveBeenCalledTimes(1);
        expect(
            client.getQueryData(['document', 'project', 'document']),
        ).toEqual(original);
        expect(client.getQueryData(['document', 'project', 'report'])).toEqual(
            original,
        );
        expect(
            client.getQueryState(['document', 'project', 'document'])
                ?.isInvalidated,
        ).toBe(true);
    });
});
