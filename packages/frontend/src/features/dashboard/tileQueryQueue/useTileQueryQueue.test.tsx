import { renderHook } from '@testing-library/react';
import { type FC, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { TileQueryQueue } from './TileQueryQueue';
import {
    TileQueryQueueContext,
    useTileQueryQueueSlot,
} from './useTileQueryQueue';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => {
    const queue = new TileQueryQueue(1);
    const wrapper: FC<{ children: ReactNode }> = ({ children }) => (
        <TileQueryQueueContext.Provider value={queue}>
            {children}
        </TileQueryQueueContext.Provider>
    );
    const started: string[] = [];
    const acquire = (tileUuid: string) => {
        void queue.acquire(tileUuid, undefined).then(() => {
            started.push(tileUuid);
        });
    };
    return { wrapper, started, acquire };
};

describe('useTileQueryQueueSlot', () => {
    it('frees the slot once the tile stops loading', async () => {
        const { wrapper, started, acquire } = setup();
        const { rerender } = renderHook(
            ({ isLoading }) => useTileQueryQueueSlot('a', isLoading),
            { wrapper, initialProps: { isLoading: true } },
        );
        acquire('a');
        acquire('b');
        await flush();
        expect(started).toEqual(['a']);

        rerender({ isLoading: false });
        await flush();

        expect(started).toEqual(['a', 'b']);
    });

    it('frees the slot when a loading tile unmounts', async () => {
        const { wrapper, started, acquire } = setup();
        const { unmount } = renderHook(() => useTileQueryQueueSlot('a', true), {
            wrapper,
        });
        acquire('a');
        acquire('b');
        await flush();

        unmount();
        await flush();

        expect(started).toEqual(['a', 'b']);
    });
});
