import { ContentType } from '@lightdash/common';
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
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
                ['document-chart-query', 'project', 'doc'],
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
            expect(mocks[operation]).toHaveBeenCalledWith(
                expect.anything(),
                'project',
                {
                    uuid: 'doc',
                    contentType: ContentType.DOCUMENT,
                },
            );
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

// Refreshing composer reads on every content action made a deleted dashboard's tiles refetch into a 404.
describe('Recently deleted actions on composer chart reads', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.restore.mockResolvedValue(undefined);
        mocks.remove.mockResolvedValue(undefined);
    });
    it.each([
        ['restore', ContentType.COMPOSER_CHART, 2, false],
        ['remove', ContentType.COMPOSER_CHART, 1, true],
        ['restore', ContentType.DASHBOARD, 1, false],
    ] as const)(
        '%s of a %s fetches an open read %i times, stale after: %s',
        async (operation, contentType, fetches, stale) => {
            const client = new QueryClient({
                defaultOptions: { mutations: { retry: false } },
            });
            const read = vi.fn(() => Promise.resolve('chart'));
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    <MemoryRouter>{children}</MemoryRouter>
                </QueryClientProvider>
            );
            const { result } = renderHook(
                () => ({
                    chart: useQuery(['composerChart', 'project', 'item'], read),
                    restore: useRestoreDeletedContent('project'),
                    remove: usePermanentlyDeleteContent('project'),
                }),
                { wrapper },
            );
            await waitFor(() =>
                expect(result.current.chart.isSuccess).toBe(true),
            );
            await act(async () =>
                result.current[operation].mutateAsync({
                    uuid: 'item',
                    contentType,
                }),
            );
            expect(read).toHaveBeenCalledTimes(fetches);
            expect(
                client.getQueryState(['composerChart', 'project', 'item'])
                    ?.isInvalidated,
            ).toBe(stale);
        },
    );

    it('restore of a composer chart links to its page', async () => {
        const client = new QueryClient();
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                <MemoryRouter>
                    {children}
                    <Location />
                </MemoryRouter>
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () => useRestoreDeletedContent('project'),
            { wrapper },
        );
        await act(async () =>
            result.current.mutateAsync({
                uuid: 'item',
                contentType: ContentType.COMPOSER_CHART,
            }),
        );
        const toast = mocks.success.mock.calls[0][0];
        expect(toast.action.children).toBe('Go to chart');
        await act(async () => toast.action.onClick());
        expect(
            screen.getByText('/projects/project/composer-charts/item'),
        ).toBeInTheDocument();
    });
});
