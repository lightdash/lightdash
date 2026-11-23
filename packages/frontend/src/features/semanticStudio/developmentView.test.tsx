import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import {
    clearDevelopmentView,
    getDevelopmentViewHeaders,
    pinDevelopmentView,
    PUBLISHED_VIEW,
    useCheckedOutView,
    useDevelopmentView,
} from './developmentView';
import { CHECKOUT_KEY, DRAFT_KEY } from './studioQueryKeys';

const at = (path: string) => window.history.pushState({}, '', path);

afterEach(() => {
    clearDevelopmentView();
    at('/');
});

describe('the development view of a checked-out draft', () => {
    it('reads the draft on every page of its project, Studio included, and on no other project', () => {
        localStorage.setItem('lightdash-checked-out-project', 'p-1 shop');
        at('/projects/shop/tables/orders');
        expect(getDevelopmentViewHeaders()).toEqual({
            [DEVELOPMENT_VIEW_HEADER]: 'true',
        });
        at('/projects/p-1/dashboards/d-1/view');
        expect(getDevelopmentViewHeaders()).toEqual({
            [DEVELOPMENT_VIEW_HEADER]: 'true',
        });
        at('/projects/shop/semantic-layer/kinds/modelled');
        expect(getDevelopmentViewHeaders()).toEqual({
            [DEVELOPMENT_VIEW_HEADER]: 'true',
        });
        at('/projects/other/tables');
        expect(getDevelopmentViewHeaders()).toEqual({});
    });

    it('leaves a Try with a preview project as it is', () => {
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        localStorage.setItem('lightdash-development-view-project', 'p-1');
        localStorage.setItem('lightdash-development-preview', 'preview-1');
        at('/projects/p-1/semantic-layer');
        expect(getDevelopmentViewHeaders()).toEqual({
            [DEVELOPMENT_VIEW_HEADER]: 'true',
            [DEVELOPMENT_PREVIEW_HEADER]: 'preview-1',
        });
    });

    it('keeps an open Try it reading its changes when the view is switched off under it', () => {
        at('/projects/p-1/semantic-layer');
        localStorage.setItem('lightdash-development-view-project', 'p-1');
        localStorage.setItem('lightdash-development-preview', 'preview-1');
        const tried = {
            [DEVELOPMENT_VIEW_HEADER]: 'true',
            [DEVELOPMENT_PREVIEW_HEADER]: 'preview-1',
        };
        const unpin = pinDevelopmentView('preview-1');
        // Another tab, or a page that leaves Studio, switches the shared view off.
        clearDevelopmentView();
        expect(getDevelopmentViewHeaders()).toEqual(tried);
        unpin();
        expect(getDevelopmentViewHeaders()).toEqual({});
    });

    it('refetches when the checkout or its compile changes, and not on a page that loaded it already', () => {
        const queryClient = new QueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useCheckedOutView(), {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            ),
        });
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        result.current('p-1', 'change-a:');
        expect(invalidate).not.toHaveBeenCalled();
        result.current('p-1', 'change-a:');
        expect(invalidate).not.toHaveBeenCalled();
        result.current('p-1', 'change-a:2026-11-18T12:00:00.000Z');
        expect(invalidate).toHaveBeenCalledTimes(1);
        result.current(null, null);
        expect(invalidate).toHaveBeenCalledTimes(2);
        expect(
            localStorage.getItem('lightdash-checked-out-project'),
        ).toBeNull();
    });

    it('never serves a draft page what was cached as published for the same key', () => {
        const queryClient = createQueryClient();
        const key = ['tables', 'orders', 'p-1'];
        at('/projects/p-1/semantic-layer');
        queryClient.setQueryData(key, 'published');
        queryClient.setQueryData([CHECKOUT_KEY, 'p-1'], 'a');
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        expect(queryClient.getQueryData(key)).toBeUndefined();
        at('/projects/p-1/tables/orders');
        expect(queryClient.getQueryData(key)).toBeUndefined();
        expect(queryClient.getQueryData([CHECKOUT_KEY, 'p-1'])).toBe('a');
        clearDevelopmentView();
        expect(queryClient.getQueryData(key)).toBe('published');
    });

    it('reads one draft in either view, so leaving a draft never brings back an older copy of it', () => {
        const queryClient = createQueryClient();
        const key = [DRAFT_KEY, 'p-1'];
        at('/projects/p-1/semantic-layer');
        queryClient.setQueryData(key, 'one change');
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        queryClient.setQueryData(key, 'discarded');
        clearDevelopmentView();
        expect(queryClient.getQueryData(key)).toBe('discarded');
    });

    it('reads one chat thread in either view, so a view switch never brings back an older copy of it', () => {
        const queryClient = createQueryClient();
        const key = ['aiAgents', 'p-1', 'a-1', 'threads', 't-1'];
        at('/projects/p-1/semantic-layer');
        queryClient.setQueryData(key, 'before the turn');
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        queryClient.setQueryData(key, 'after the turn');
        clearDevelopmentView();
        expect(queryClient.getQueryData(key)).toBe('after the turn');
    });

    it('reads a query that names what is published the same on and off a draft', () => {
        const queryClient = createQueryClient();
        const key = ['tables', 'p-1', 'filtered', PUBLISHED_VIEW];
        at('/projects/p-1/semantic-layer');
        queryClient.setQueryData(key, 'published');
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        expect(queryClient.getQueryData(key)).toBe('published');
    });

    it('keeps what a page shows while Try it switches the view, then refetches it', () => {
        const queryClient = createQueryClient();
        const key = ['project', 'p-1'];
        at('/projects/p-1/semantic-layer');
        queryClient.setQueryData(key, 'published');
        queryClient.setQueryData([CHECKOUT_KEY, 'p-1'], 'a');
        const access = ['ai-access', 'p-1', null, 'me'];
        queryClient.setQueryData(access, 'allowed');
        const { result } = renderHook(() => useDevelopmentView(), {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            ),
        });
        act(() => result.current[1](true));
        expect(getDevelopmentViewHeaders()).toEqual({
            [DEVELOPMENT_VIEW_HEADER]: 'true',
        });
        expect(queryClient.getQueryData(key)).toBe('published');
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        // The chat's composer hides while this refetches, so a view switch leaves it alone.
        expect(queryClient.getQueryState(access)?.isInvalidated).toBe(false);
    });

    it('switches Try it on over a checked-out draft, which already reads the changes, without fetching again', () => {
        const queryClient = createQueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        localStorage.setItem('lightdash-checked-out-project', 'p-1');
        at('/projects/p-1/semantic-layer');
        const { result } = renderHook(() => useDevelopmentView(), {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            ),
        });
        expect(result.current[0]).toBe(false);
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        act(() => result.current[1](false));
        expect(result.current[0]).toBe(false);
        expect(invalidate).not.toHaveBeenCalled();
    });
});
