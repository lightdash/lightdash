import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { lightdashApi } from '../api';
import { useTrackContentView } from './useTrackContentView';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({ user: { data: { userUuid: 'reader' } } }),
}));
const wrapper = ({ children }: PropsWithChildren) => (
    <StrictMode>{children}</StrictMode>
);
describe('page view capture', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset().mockResolvedValue(undefined);
    });
    it('records once on cached page load, not for rerenders or tile updates', async () => {
        const { rerender } = renderHook(
            () => useTrackContentView('project', 'dashboard', 'dashboard'),
            { wrapper },
        );
        for (let tile = 0; tile < 10; tile += 1) rerender();
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
        expect(
            JSON.parse(String(vi.mocked(lightdashApi).mock.calls[0][0].body)),
        ).toMatchObject({
            contentUuid: 'dashboard',
            context: 'direct',
            viewId: expect.any(String),
        });
    });
    it('waits for loaded content and assigns a new identity to each navigation', async () => {
        const { rerender } = renderHook(
            ({ id }) => useTrackContentView('project', 'chart', id),
            { initialProps: { id: undefined as string | undefined }, wrapper },
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        rerender({ id: 'one' });
        rerender({ id: 'two' });
        rerender({ id: 'one' });
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(3));
        const calls = vi.mocked(lightdashApi).mock.calls;
        expect(
            new Set(calls.map(([arg]) => JSON.parse(String(arg.body)).viewId))
                .size,
        ).toBe(3);
    });
    it('classifies editing as preview and swallows tracking errors', async () => {
        vi.mocked(lightdashApi).mockRejectedValue(new Error('offline'));
        const { rerender } = renderHook(
            () => useTrackContentView('project', 'sql_chart', 'sql', 'preview'),
            { wrapper },
        );
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
        rerender();
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        expect(
            JSON.parse(String(vi.mocked(lightdashApi).mock.calls[0][0].body))
                .context,
        ).toBe('preview');
    });
});
