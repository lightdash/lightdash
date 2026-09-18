import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import * as rudderSDK from 'rudder-sdk-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line vitest-js/no-mocks-import -- Shared test fixture, not an auto-mocked module.
import mockHealthResponse from '../../testing/__mocks__/api/healthResponse.mock';
// oxlint-disable-next-line vitest-js/no-mocks-import -- Shared context fixture keeps the real useApp hook in this test.
import AppProviderMock from '../../testing/__mocks__/providers/AppProvider.mock';
import { EventName, PageName, SectionName } from '../../types/Events';
import TrackingProvider, { TrackPage, TrackSection } from './TrackingProvider';
import useTracking from './useTracking';

vi.mock('rudder-sdk-js', () => ({
    load: vi.fn(),
    ready: vi.fn(),
    track: vi.fn(),
    page: vi.fn(),
    identify: vi.fn(),
}));

describe('TrackingProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    it('still reports a missing provider rather than silently disabling tracking', () => {
        expect(() => renderHook(() => useTracking())).toThrow(
            'useTracking must be used within a TrackingProvider',
        );
    });

    it.each([false, true])(
        'supports disabled tracking consumers (nested: %s) without sending analytics',
        (nested) => {
            const { result } = renderHook(() => useTracking(), {
                wrapper: ({ children }) => (
                    <TrackingProvider enabled={false} rudder={rudderSDK}>
                        {nested ? (
                            <TrackPage name={PageName.DASHBOARD}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    {children}
                                </TrackSection>
                            </TrackPage>
                        ) : (
                            children
                        )}
                    </TrackingProvider>
                ),
            });

            result.current.track({ name: EventName.COMMENTS_CLICKED });
            result.current.page({ name: PageName.DASHBOARD });
            result.current.identify({ id: 'screenshot-user' });

            expect(rudderSDK.load).not.toHaveBeenCalled();
            expect(rudderSDK.ready).not.toHaveBeenCalled();
            expect(rudderSDK.track).not.toHaveBeenCalled();
            expect(rudderSDK.page).not.toHaveBeenCalled();
            expect(rudderSDK.identify).not.toHaveBeenCalled();
        },
    );

    it('preserves analytics and page/section context when enabled', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(['health'], mockHealthResponse());
        const { result, unmount } = renderHook(() => useTracking(), {
            wrapper: ({ children }) => (
                <QueryClientProvider client={queryClient}>
                    <AppProviderMock>
                        <TrackingProvider rudder={rudderSDK}>
                            <TrackPage name={PageName.DASHBOARD}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    {children}
                                </TrackSection>
                            </TrackPage>
                        </TrackingProvider>
                    </AppProviderMock>
                </QueryClientProvider>
            ),
        });

        result.current.track({ name: EventName.COMMENTS_CLICKED });
        result.current.identify({ id: 'interactive-user' });

        expect(rudderSDK.track).toHaveBeenCalledWith(
            'lightdash_webapp.comments.clicked',
            {},
            expect.objectContaining({
                page: expect.objectContaining({ name: PageName.DASHBOARD }),
                section: { name: SectionName.DASHBOARD_TILE },
            }),
        );
        expect(rudderSDK.page).toHaveBeenCalledWith(
            undefined,
            PageName.DASHBOARD,
            expect.objectContaining({ name: PageName.DASHBOARD }),
            expect.any(Object),
        );
        expect(rudderSDK.identify).toHaveBeenCalledWith(
            'interactive-user',
            undefined,
            expect.any(Object),
        );
        unmount();
        queryClient.clear();
    });
});
