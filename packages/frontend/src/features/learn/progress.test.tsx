import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));

// Learn's organization switch: the library and the navbar link read it, and
// progress is only asked for where it is on.
const learnFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: learnFlag.enabled } }),
}));

import { lightdashApi } from '../../api';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import { useLearnProgress, useLearnProgressActions } from './progress';

const api = lightdashApi as unknown as Mock;

const calls = () =>
    api.mock.calls.map(([{ method, url, body }]) => ({
        method,
        url,
        body: body ? JSON.parse(body) : undefined,
    }));

const server = {
    completed: ['view:Dashboard'],
    started: ['view:Dashboard', 'manage:Space'],
    lastStarted: 'manage:Space',
};

const setup = () => {
    const queryClient = createQueryClient({ queries: { retry: false } });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return renderHook(
        () => ({
            progress: useLearnProgress(),
            actions: useLearnProgressActions(),
        }),
        { wrapper },
    );
};

describe('useLearnProgress', () => {
    beforeEach(() => {
        localStorage.clear();
        api.mockReset();
        learnFlag.enabled = true;
    });

    it('asks for nothing where Learn is switched off', async () => {
        learnFlag.enabled = false;
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify(['view:Dashboard']),
        );
        const { result } = setup();

        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        expect(api).not.toHaveBeenCalled();
        expect(result.current.progress.completed).toEqual([]);
        // The browser's copy is left alone for an instance that turns Learn on.
        expect(localStorage.getItem('lightdash.learn.completed')).toBe(
            JSON.stringify(['view:Dashboard']),
        );
    });

    it('is empty until the instance answers, then shows what it holds', async () => {
        api.mockResolvedValueOnce(server);
        const { result } = setup();

        expect(result.current.progress).toEqual({
            completed: [],
            started: [],
            lastStarted: null,
            isSettled: false,
        });
        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        expect(result.current.progress).toEqual({
            ...server,
            isSettled: true,
        });
        expect(calls()).toEqual([
            { method: 'GET', url: '/user/learn-progress', body: undefined },
        ]);
    });

    it('sends progress the browser kept before the instance did, once', async () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify(['view:Dashboard']),
        );
        localStorage.setItem(
            'lightdash.learn.started',
            JSON.stringify(['view:Dashboard', 'manage:Space']),
        );
        localStorage.setItem('lightdash.learn.lastStarted', 'manage:Space');
        api.mockResolvedValueOnce(server);
        const { result } = setup();

        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        expect(calls()).toEqual([
            {
                method: 'POST',
                url: '/user/learn-progress/merge',
                body: server,
            },
        ]);
        expect(result.current.progress).toEqual({
            ...server,
            isSettled: true,
        });
        expect(localStorage.getItem('lightdash.learn.completed')).toBeNull();
        expect(localStorage.getItem('lightdash.learn.started')).toBeNull();
        expect(localStorage.getItem('lightdash.learn.lastStarted')).toBeNull();
    });

    it('keeps the browser copy when the instance could not take it', async () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify(['view:Dashboard']),
        );
        api.mockRejectedValueOnce(new Error('offline'));
        const { result } = setup();

        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        expect(localStorage.getItem('lightdash.learn.completed')).toBe(
            JSON.stringify(['view:Dashboard']),
        );
    });

    it('shows a start at once and points Resume at it', async () => {
        api.mockResolvedValueOnce(server);
        const { result } = setup();
        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        let resolve: (value: unknown) => void = () => {};
        api.mockReturnValueOnce(
            new Promise((r) => {
                resolve = r;
            }),
        );

        act(() => result.current.actions.markScopeStarted('view:Explore'));

        await waitFor(() =>
            expect(result.current.progress.lastStarted).toBe('view:Explore'),
        );
        expect(result.current.progress.started).toContain('view:Explore');
        expect(calls()[1]).toEqual({
            method: 'POST',
            url: '/user/learn-progress/view%3AExplore/started',
            body: undefined,
        });
        // The instance's answer keeps what was shown.
        await act(async () => {
            resolve({
                ...server,
                started: [...server.started, 'view:Explore'],
            });
        });
        expect(result.current.progress.lastStarted).toBe('view:Explore');
        expect(result.current.progress.started).toEqual([
            'view:Dashboard',
            'manage:Space',
            'view:Explore',
        ]);
    });

    it('shows a completion at once and never undoes it', async () => {
        api.mockResolvedValueOnce(server);
        const { result } = setup();
        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        api.mockResolvedValueOnce(server);

        act(() => result.current.actions.markScopeCompleted('manage:Space'));

        await waitFor(() =>
            expect(result.current.progress.completed).toContain('manage:Space'),
        );
        expect(calls()[1]).toEqual({
            method: 'POST',
            url: '/user/learn-progress/manage%3ASpace/completed',
            body: undefined,
        });
        // A stale answer from the instance does not take the completion back.
        await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
        expect(result.current.progress.completed).toEqual([
            'view:Dashboard',
            'manage:Space',
        ]);
    });

    it('asks the instance again when it refuses a write', async () => {
        api.mockResolvedValueOnce(server);
        const { result } = setup();
        await waitFor(() =>
            expect(result.current.progress.isSettled).toBe(true),
        );
        api.mockRejectedValueOnce(new Error('unknown scope'));
        api.mockResolvedValueOnce(server);

        act(() => result.current.actions.markScopeStarted('manage:Invented'));

        await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
        await waitFor(() =>
            expect(result.current.progress.started).not.toContain(
                'manage:Invented',
            ),
        );
        expect(calls()[2].method).toBe('GET');
    });
});
