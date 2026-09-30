import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BASE_API_URL } from '../api';
import { useOnboardingTour } from './useOnboardingTour';

afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
});

describe('useOnboardingTour', () => {
    it.each(['url', 'session'])(
        'defers onboarding during a %s walkthrough and still offers it on a later visit',
        async (source) => {
            if (source === 'url') {
                window.history.replaceState(null, '', '/?tour=view%3AAiAgent');
            } else {
                sessionStorage.setItem(
                    'lightdash.scopeTour',
                    JSON.stringify({ scope: 'view:AiAgent' }),
                );
            }
            const queryClient = new QueryClient({
                defaultOptions: {
                    queries: { retry: false },
                    mutations: { retry: false },
                },
            });
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            );
            nock(BASE_API_URL)
                .get('/api/v1/user/onboarding')
                .reply(200, {
                    status: 'ok',
                    results: { completedTours: {} },
                });
            const walkthroughVisit = renderHook(
                () => useOnboardingTour({ tour: 'memoryTour' }),
                { wrapper },
            );
            await waitFor(() =>
                expect(walkthroughVisit.result.current.isCompleted).toBe(false),
            );
            expect(walkthroughVisit.result.current.shouldShow).toBe(false);
            walkthroughVisit.unmount();

            sessionStorage.clear();
            window.history.replaceState(null, '', '/');
            const laterVisit = renderHook(
                () => useOnboardingTour({ tour: 'memoryTour' }),
                { wrapper },
            );
            expect(laterVisit.result.current.shouldShow).toBe(true);
            nock(BASE_API_URL)
                .post('/api/v1/user/onboarding', { tour: 'memoryTour' })
                .reply(200, { status: 'ok' });
            act(() => laterVisit.result.current.closeTour());
            await waitFor(() =>
                expect(laterVisit.result.current.isCompleted).toBe(true),
            );
            laterVisit.unmount();

            const seenVisit = renderHook(
                () => useOnboardingTour({ tour: 'memoryTour' }),
                { wrapper },
            );
            expect(seenVisit.result.current.shouldShow).toBe(false);
            seenVisit.unmount();
            queryClient.clear();
        },
    );
});
