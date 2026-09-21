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
            ['document', 'project', 'document'],
            ['document', 'project', 'document-slug'],
            ['pinned_items', 'project', 'list'],
            ['favorites', 'project'],
            ['project', 'project'],
            ['content', { projectUuids: ['project'] }],
            ['space', 'project', 'space'],
            ['homepage_collection_content', 'project', 'document'],
        ];
        const unaffectedKeys = [
            ['document', 'other-project', 'other-document'],
            ['pinned_items', 'other-project', 'other-list'],
            ['favorites', 'other-project'],
            ['project', 'other-project'],
            ['space', 'project', 'other-space'],
            ['space', 'other-project', 'space'],
            ['homepage_collection_content', 'other-project', 'document'],
        ];
        [...keys, ...unaffectedKeys].forEach((key) =>
            client.setQueryData(key, { stalePin: true }),
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
            expect(client.getQueryState(key)?.isInvalidated).toBe(true),
        );
        unaffectedKeys.forEach((key) =>
            expect(client.getQueryState(key)?.isInvalidated).toBe(false),
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
