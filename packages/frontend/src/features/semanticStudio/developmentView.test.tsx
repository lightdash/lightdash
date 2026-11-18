import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearDevelopmentView,
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
    getDevelopmentViewHeaders,
    useCheckedOutView,
} from './developmentView';

const at = (path: string) => window.history.pushState({}, '', path);

afterEach(() => {
    clearDevelopmentView();
    at('/');
});

describe('the development view of a checked-out draft', () => {
    it('reads the draft on every page of its project but Studio, and on no other project', () => {
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
        expect(getDevelopmentViewHeaders()).toEqual({});
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
});
