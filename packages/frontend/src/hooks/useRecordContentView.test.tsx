import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { lightdashApi } from '../api';
import { useRecordContentView } from './useRecordContentView';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({ user: { data: { userUuid: 'viewer' } } }),
}));

describe('useRecordContentView', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset().mockResolvedValue(undefined);
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <StrictMode>
            <QueryClientProvider client={new QueryClient()}>
                {children}
            </QueryClientProvider>
        </StrictMode>
    );

    it('waits for content then records once across renders and StrictMode effects', async () => {
        const { rerender } = renderHook(
            ({ uuid }: { uuid: string | undefined }) =>
                useRecordContentView('project', 'chart', uuid),
            {
                initialProps: { uuid: undefined as string | undefined },
                wrapper,
            },
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        rerender({ uuid: 'chart-1' });
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
        rerender({ uuid: 'chart-1' });
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                body: JSON.stringify({
                    projectUuid: 'project',
                    contentType: 'chart',
                    contentUuid: 'chart-1',
                }),
            }),
        );
    });

    it('records a different item and a subsequent revisit', async () => {
        const { rerender } = renderHook(
            ({ uuid }) => useRecordContentView('project', 'dashboard', uuid),
            { initialProps: { uuid: 'first' }, wrapper },
        );
        rerender({ uuid: 'second' });
        rerender({ uuid: 'first' });
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(3));
    });

    it('does not retry failed tracking on rerender', async () => {
        vi.mocked(lightdashApi).mockRejectedValue(new Error('offline'));
        const { rerender } = renderHook(
            () => useRecordContentView('project', 'chart', 'chart'),
            { wrapper },
        );
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
        rerender();
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });
});
