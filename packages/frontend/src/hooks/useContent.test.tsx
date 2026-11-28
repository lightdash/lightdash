import { ContentType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { useContentAction, useContentBulkAction } from './useContent';

vi.mock('../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => () => Promise.resolve(undefined),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({ health: { data: undefined } }),
}));
vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));

const setup = () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const refreshedComposerCharts = () =>
        invalidateQueries.mock.calls.some(
            ([key]) => Array.isArray(key) && key[0] === 'composerChart',
        );
    return { wrapper, refreshedComposerCharts };
};

// Refreshing composer charts on every action made a deleted dashboard's tiles refetch into a 404.
describe('content actions refresh composer chart reads only when they include one', () => {
    it.each([
        [ContentType.COMPOSER_CHART, true],
        [ContentType.DASHBOARD, false],
    ])('single action on %s: %s', async (contentType, expected) => {
        const { wrapper, refreshedComposerCharts } = setup();
        const { result } = renderHook(() => useContentAction('project'), {
            wrapper,
        });
        await act(() =>
            result.current.mutateAsync({
                action: { type: 'delete' },
                item: { uuid: 'item', contentType },
            }),
        );
        expect(refreshedComposerCharts()).toBe(expected);
    });

    it.each([
        [[ContentType.CHART, ContentType.COMPOSER_CHART], true],
        [[ContentType.CHART, ContentType.DASHBOARD], false],
    ])('bulk action on %s: %s', async (contentTypes, expected) => {
        const { wrapper, refreshedComposerCharts } = setup();
        const { result } = renderHook(() => useContentBulkAction('project'), {
            wrapper,
        });
        await act(() =>
            result.current.mutateAsync({
                action: { type: 'move', targetSpaceUuid: 'space' },
                content: contentTypes.map((contentType, i) => ({
                    uuid: `item-${i}`,
                    contentType,
                })),
            }),
        );
        expect(refreshedComposerCharts()).toBe(expected);
    });
});
