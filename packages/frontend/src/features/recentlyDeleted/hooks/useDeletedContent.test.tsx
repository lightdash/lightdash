import { ContentType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import {
    usePermanentlyDeleteContent,
    useRestoreDeletedContent,
} from './useDeletedContent';

const mocks = vi.hoisted(() => ({
    restore: vi.fn(),
    remove: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}));
vi.mock('../api/deletedContent', () => ({
    restoreDeletedContent: mocks.restore,
    permanentlyDeleteContent: mocks.remove,
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));
const Location = () => <div>{useLocation().pathname}</div>;

describe('Document trash mutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.restore.mockResolvedValue(undefined);
        mocks.remove.mockResolvedValue(undefined);
    });
    it.each(['restore', 'remove'] as const)(
        '%s refreshes Document caches and uses the canonical restore link',
        async (operation) => {
            const client = new QueryClient({
                defaultOptions: { mutations: { retry: false } },
            });
            const keys = [
                ['documents', 'project'],
                ['document', 'project', 'doc'],
                ['document-cell-query', 'project', 'doc'],
                ['deletedContent'],
            ];
            keys.forEach((key) => client.setQueryData(key, 'cached'));
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    <MemoryRouter>
                        {children}
                        <Location />
                    </MemoryRouter>
                </QueryClientProvider>
            );
            const { result } = renderHook(
                () => ({
                    restore: useRestoreDeletedContent('project'),
                    remove: usePermanentlyDeleteContent('project'),
                }),
                { wrapper },
            );
            await act(async () =>
                result.current[operation].mutateAsync({
                    uuid: 'doc',
                    contentType: ContentType.DOCUMENT,
                }),
            );
            expect(mocks[operation]).toHaveBeenCalledWith('project', {
                uuid: 'doc',
                contentType: ContentType.DOCUMENT,
            });
            keys.forEach((key) =>
                expect(client.getQueryState(key)?.isInvalidated).toBe(true),
            );
            if (operation === 'restore') {
                const toast = mocks.success.mock.calls[0][0];
                expect(toast.action.children).toBe('Go to document');
                await act(async () => toast.action.onClick());
                expect(
                    screen.getByText('/projects/project/documents/doc'),
                ).toBeInTheDocument();
            }
        },
    );
});
