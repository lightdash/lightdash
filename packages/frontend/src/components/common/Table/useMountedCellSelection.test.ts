import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMountedCellSelection } from './useMountedCellSelection';

afterEach(() => vi.restoreAllMocks());

const afterCommit = () =>
    act(async () => {
        await Promise.resolve();
    });

it('checks the selection only when the selected cell unmounts', async () => {
    const queueMicrotask = vi.spyOn(globalThis, 'queueMicrotask');
    const { result } = renderHook(() => useMountedCellSelection());
    const [unregisterA, unregisterB, unregisterC] = ['a', 'b', 'c'].map((key) =>
        result.current.registerCell(key),
    );
    act(() => result.current.setSelectedKey('b'));

    // A wide table unmounts many cells at once on scroll.
    unregisterA();
    unregisterC();
    expect(queueMicrotask).not.toHaveBeenCalled();

    unregisterB();
    expect(queueMicrotask).toHaveBeenCalledTimes(1);
    await afterCommit();
    expect(result.current.selectedKey).toBeNull();
});

it('keeps the selection when a cell with the same key mounts in the same commit', async () => {
    const { result } = renderHook(() => useMountedCellSelection());
    const unregister = result.current.registerCell('merged');
    act(() => result.current.setSelectedKey('merged'));

    unregister();
    result.current.registerCell('merged');
    await afterCommit();
    expect(result.current.selectedKey).toBe('merged');
});
