import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedDraft } from './useDebouncedDraft';

const DELAY = 500;

const renderDraft = (initialValue: string) => {
    const commit = vi.fn<(value: string) => void>();
    const hook = renderHook(
        ({ value }) => useDebouncedDraft(value, commit, { delay: DELAY }),
        { initialProps: { value: initialValue } },
    );
    const draft = () => hook.result.current[0];
    const setDraft = (next: string) => {
        act(() => hook.result.current[1](next));
    };
    const flush = () => {
        act(() => hook.result.current[2]());
    };
    return { ...hook, commit, draft, setDraft, flush };
};

describe('useDebouncedDraft', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows each edit at once and commits only the last one after the delay', () => {
        const { commit, draft, setDraft } = renderDraft('');
        setDraft('a');
        setDraft('ab');
        expect(draft()).toBe('ab');

        act(() => {
            vi.advanceTimersByTime(DELAY - 1);
        });
        expect(commit).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(commit.mock.calls).toEqual([['ab']]);
    });

    it('commits a pending edit straight away through the returned flush, as on blur', () => {
        const { commit, setDraft, flush } = renderDraft('');
        setDraft('typed');
        flush();
        expect(commit.mock.calls).toEqual([['typed']]);

        act(() => {
            vi.advanceTimersByTime(DELAY);
        });
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('commits a pending edit when it unmounts mid-debounce', () => {
        const { commit, setDraft, unmount } = renderDraft('');
        setDraft('typed');
        unmount();
        expect(commit.mock.calls).toEqual([['typed']]);
    });

    it('follows the store value whenever no edit is pending', () => {
        const { commit, draft, setDraft, rerender } = renderDraft('saved');
        rerender({ value: 'changed elsewhere' });
        expect(draft()).toBe('changed elsewhere');

        setDraft('typed');
        act(() => {
            vi.advanceTimersByTime(DELAY);
        });
        expect(commit.mock.calls).toEqual([['typed']]);
        rerender({ value: 'reset by the owner' });
        expect(draft()).toBe('reset by the owner');
    });
});
