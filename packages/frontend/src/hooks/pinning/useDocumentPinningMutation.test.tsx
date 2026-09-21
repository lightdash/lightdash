import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { useDocumentPinningMutation } from './useDocumentPinningMutation';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));

it.each([true, false])(
    'refreshes pin state on every surface after toggling to %s',
    async (isPinned) => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const keys = [
            'pinned_items',
            'favorites',
            'project',
            'content',
            'space',
            'homepage_collection_content',
        ];
        keys.forEach((key) =>
            client.setQueryData([key, 'project'], { stalePin: true }),
        );
        mocks.api.mockResolvedValue({
            projectUuid: 'project',
            pinnedListUuid: 'list',
            spaceUuid: 'space',
            isPinned,
        });
        const { result, unmount } = renderHook(useDocumentPinningMutation, {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            ),
        });
        await act(async () => {
            await result.current.mutateAsync({
                projectUuid: 'project',
                documentUuid: 'document',
            });
        });
        expect(mocks.api).toHaveBeenCalledWith({
            url: '/projects/project/documents/document/pinning',
            method: 'PATCH',
            body: '{}',
        });
        keys.forEach((key) =>
            expect(client.getQueryState([key, 'project'])?.isInvalidated).toBe(
                true,
            ),
        );
        expect(mocks.success).toHaveBeenLastCalledWith({
            title: isPinned
                ? 'Success! Document was pinned to homepage'
                : 'Success! Document was unpinned from homepage',
        });
        unmount();
        client.clear();
    },
);
