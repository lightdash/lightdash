import { type Dashboard } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../events/types';
import { useEmbedDashboardTabChange } from './useEmbedDashboardTabChange';

const dispatchEmbedEvent = vi.fn();
vi.mock('./useEmbedEventEmitter', () => ({
    useEmbedEventEmitter: () => ({ dispatchEmbedEvent }),
}));

const tabs = [
    { uuid: 'tab-one', name: 'One', order: 0 },
    { uuid: 'tab-two', name: 'Two', order: 1 },
] as Dashboard['tabs'];

describe('useEmbedDashboardTabChange', () => {
    beforeEach(() => dispatchEmbedEvent.mockClear());

    it('emits one SDK event without changing the host URL', () => {
        const setActiveTab = vi.fn();
        const { result } = renderHook(
            () => {
                const location = useLocation();
                return {
                    location,
                    changeTab: useEmbedDashboardTabChange({
                        activeTab: tabs[0],
                        mode: 'sdk',
                        pathname: location.pathname,
                        search: location.search,
                        setActiveTab,
                        visibleTabs: tabs,
                    }),
                };
            },
            {
                wrapper: ({ children }) => (
                    <MemoryRouter initialEntries={['/host?customer=one']}>
                        {children}
                    </MemoryRouter>
                ),
            },
        );

        act(() => result.current.changeTab('tab-two'));

        expect(setActiveTab).toHaveBeenCalledOnce();
        expect(dispatchEmbedEvent).toHaveBeenCalledWith(
            LightdashEventType.TabChanged,
            { tabIndex: 1 },
        );
        expect(result.current.location.pathname).toBe('/host');
    });

    it('updates a direct iframe URL and ignores the active tab', () => {
        const setActiveTab = vi.fn();
        const { result } = renderHook(
            () => {
                const location = useLocation();
                return {
                    location,
                    changeTab: useEmbedDashboardTabChange({
                        activeTab: tabs[0],
                        mode: 'direct',
                        pathname: location.pathname,
                        search: location.search,
                        setActiveTab,
                        visibleTabs: tabs,
                    }),
                };
            },
            {
                wrapper: ({ children }) => (
                    <MemoryRouter
                        initialEntries={[
                            '/embed/project/dashboard/example/tabs/tab-one?customer=one',
                        ]}
                    >
                        {children}
                    </MemoryRouter>
                ),
            },
        );

        act(() => result.current.changeTab('tab-one'));
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();

        act(() => result.current.changeTab('tab-two'));
        expect(result.current.location.pathname).toBe(
            '/embed/project/dashboard/example/tabs/tab-two',
        );
        expect(result.current.location.search).toBe('?customer=one');
    });
});
