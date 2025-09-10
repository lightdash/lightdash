import type { HealthState } from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashUiEvent } from './LightdashUiEvent';
import {
    LightdashEventType,
    type AllTilesLoadedPayload,
    type FilterChangedPayload,
    type TabChangedPayload,
} from './types';

// Mock Sentry at the module level
vi.mock('@sentry/react', async () => {
    const actual = await vi.importActual('@sentry/react');
    return {
        ...actual,
        addBreadcrumb: vi.fn(),
        captureException: vi.fn(() => ''),
    };
});

describe('LightdashUiEvent', () => {
    let dispatchEventSpy: any;
    let postMessageSpy: any;
    let eventSystem: LightdashUiEvent;
    let mockConfig: HealthState['embedding']['events'];

    beforeEach(() => {
        dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

        // Mock window.parent to be different from window (simulate iframe)
        const mockParent = { postMessage: vi.fn() };
        Object.defineProperty(window, 'parent', {
            value: mockParent,
            writable: true,
            configurable: true,
        });
        postMessageSpy = vi.spyOn(mockParent, 'postMessage');

        // Mock window.location.pathname for embed context
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/embed/dashboard/123',
            },
            writable: true,
            configurable: true,
        });
        vi.useFakeTimers();

        // Set up mock backend configuration
        mockConfig = {
            enabled: true,
            rateLimiting: {
                maxEventsPerWindow: 10,
                windowDurationMs: 1000,
            },
            allowedOrigins: [
                'https://trusted-domain.com',
                'https://app.example.com',
                'https://customer-app.com',
                'https://example.com',
            ],
            enablePostMessage: true,
        };

        // Create event system with a test targetOrigin
        eventSystem = new LightdashUiEvent(mockConfig, 'https://example.com');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Constructor', () => {
        it('should throw error when config is null or undefined', () => {
            expect(() => new LightdashUiEvent(null as any)).toThrow(
                'Config is required',
            );
            expect(() => new LightdashUiEvent(undefined as any)).toThrow(
                'Config is required',
            );
        });
    });

    describe('Static Methods', () => {
        it('should extract targetOrigin from URL parameters', () => {
            // Mock URL parameters
            Object.defineProperty(window, 'location', {
                value: {
                    pathname: '/embed/dashboard/123',
                    search: '?targetOrigin=https://customer-app.com&dashboardId=123',
                },
                writable: true,
                configurable: true,
            });

            const targetOrigin = LightdashUiEvent.getTargetOriginFromUrl();
            expect(targetOrigin).toBe('https://customer-app.com');
        });

        it('should return undefined when no targetOrigin in URL', () => {
            // Mock URL without targetOrigin parameter
            Object.defineProperty(window, 'location', {
                value: {
                    pathname: '/embed/dashboard/123',
                    search: '?dashboardId=123',
                },
                writable: true,
                configurable: true,
            });

            const targetOrigin = LightdashUiEvent.getTargetOriginFromUrl();
            expect(targetOrigin).toBeUndefined();
        });

        it('should return undefined for invalid targetOrigin URLs', () => {
            // Mock URL with invalid targetOrigin
            Object.defineProperty(window, 'location', {
                value: {
                    pathname: '/embed/dashboard/123',
                    search: '?targetOrigin=invalid-url',
                    href: 'http://localhost:3000/embed/dashboard/123?targetOrigin=invalid-url',
                },
                writable: true,
                configurable: true,
            });

            const targetOrigin = LightdashUiEvent.getTargetOriginFromUrl();
            expect(targetOrigin).toBeUndefined();
        });
    });

    describe('Security Tests', () => {
        it('should only send postMessage when explicit origin is provided', () => {
            const payload = { tabIndex: 1 };

            // Without targetOrigin (use default eventSystem which has targetOrigin)
            const noTargetEventSystem = new LightdashUiEvent(mockConfig); // No targetOrigin
            noTargetEventSystem.dispatch(
                LightdashEventType.TabChanged,
                payload,
            );
            expect(postMessageSpy).not.toHaveBeenCalled();

            // With targetOrigin
            eventSystem.dispatch(LightdashEventType.TabChanged, payload);
            expect(postMessageSpy).toHaveBeenCalledTimes(1);
        });

        it('should reject postMessage with wildcard (*) origin', () => {
            const payload = {
                hasFilters: false,
                filterCount: 0,
            };

            // Create event system with wildcard origin (should be rejected in constructor)
            const wildcardEventSystem = new LightdashUiEvent(mockConfig, '*');
            wildcardEventSystem.dispatch(
                LightdashEventType.FilterChanged,
                payload,
            );

            expect(postMessageSpy).not.toHaveBeenCalled();
        });

        it('should only dispatch events in valid embed context', () => {
            // Test with non-iframe context (window.parent === window)
            Object.defineProperty(window, 'parent', {
                value: window,
                writable: true,
                configurable: true,
            });

            const payload = {
                hasFilters: false,
                filterCount: 0,
            };
            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1); // DOM event still fires
            expect(postMessageSpy).not.toHaveBeenCalled(); // No postMessage in non-iframe context

            // Valid iframe path should work
            Object.defineProperty(window, 'parent', {
                value: { postMessage: postMessageSpy },
                writable: true,
                configurable: true,
            });

            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            expect(postMessageSpy).toHaveBeenCalledTimes(1);
        });

        it('should validate target origin is in allowed list', () => {
            const msgSpy = vi.spyOn(window.parent, 'postMessage');

            // Create event system with malicious origin - should be rejected
            const invalidEventSystem = new LightdashUiEvent(
                mockConfig,
                'https://malicious-site.com',
            );

            const payload = {
                errorType: 'ValidationError',
            };
            invalidEventSystem.dispatch(LightdashEventType.Error, payload);
            expect(msgSpy).not.toHaveBeenCalled();
        });
    });

    describe('Core Functionality', () => {
        it('should dispatch DOM CustomEvent with namespaced event type', () => {
            const payload: TabChangedPayload = {
                tabIndex: 2,
            };

            eventSystem.dispatch(LightdashEventType.TabChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'lightdash:tabChanged',
                    detail: expect.objectContaining({
                        tabIndex: 2,
                    }),
                }),
            );
        });

        it('should bubble DOM events by default', () => {
            const payload: AllTilesLoadedPayload = {
                tilesCount: 4,
                loadTimeMs: 800,
            };

            eventSystem.dispatch(LightdashEventType.AllTilesLoaded, payload);

            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    bubbles: true,
                }),
            );
        });

        it('should send postMessage only when targetOrigin is explicitly provided', () => {
            const msgSpy = vi.spyOn(window.parent, 'postMessage');

            // Test dispatch without targetOrigin (create system without targetOrigin)
            const eventSystemNoTarget = new LightdashUiEvent(mockConfig);
            const payload = {
                errorType: 'ChartLoadError',
            };

            // Without targetOrigin
            eventSystemNoTarget.dispatch(LightdashEventType.Error, payload);
            expect(msgSpy).not.toHaveBeenCalled();

            // With targetOrigin (use default eventSystem which has targetOrigin)
            eventSystem.dispatch(LightdashEventType.Error, payload);
            expect(msgSpy).toHaveBeenCalledTimes(1);
        });

        it('should not send postMessage if not in iframe context', () => {
            // Mock non-iframe context
            Object.defineProperty(window, 'parent', {
                value: window,
                writable: true,
                configurable: true,
            });

            const payload = {
                hasFilters: false,
                filterCount: 0,
            };
            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).not.toHaveBeenCalled();
        });

        it('should not send postMessage without valid embed pathname', () => {
            // Mock window.location.pathname to a non-embed path
            Object.defineProperty(window, 'location', {
                value: {
                    pathname: '/dashboard/123', // Not an embed path
                },
                writable: true,
                configurable: true,
            });

            const payload = { tabIndex: 1 };

            eventSystem.dispatch(LightdashEventType.TabChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).not.toHaveBeenCalled();
        });
    });

    describe('Usage Examples', () => {
        it('should dispatch FilterChanged event with sanitized filters', () => {
            const payload: FilterChangedPayload = {
                hasFilters: true,
                filterCount: 2,
            };

            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).toHaveBeenCalledTimes(1);
        });

        it('should dispatch TabChanged event with minimal data', () => {
            // Create event system with specific targetOrigin for this test
            const testEventSystem = new LightdashUiEvent(
                mockConfig,
                'https://app.example.com',
            );

            const payload: TabChangedPayload = {
                tabIndex: 3,
            };

            testEventSystem.dispatch(LightdashEventType.TabChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'lightdash:tabChanged',
                    payload: {
                        tabIndex: 3,
                    },
                }),
                'https://app.example.com',
            );
        });

        it('should dispatch AllTilesLoaded event with tile count only', () => {
            const payload: AllTilesLoadedPayload = {
                tilesCount: 6,
                loadTimeMs: 1500,
            };

            eventSystem.dispatch(LightdashEventType.AllTilesLoaded, payload);

            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'lightdash:allTilesLoaded',
                    detail: {
                        tilesCount: 6,
                        loadTimeMs: 1500,
                    },
                }),
            );
        });
    });

    describe('Rate Limiting', () => {
        it('should limit events to 10 per second per event type', () => {
            const payload = {
                hasFilters: true,
                filterCount: 1,
            };

            // Send 10 events (should all succeed)
            for (let i = 0; i < 10; i++) {
                eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            }
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10);

            // 11th event should be rate limited
            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10); // Still 10, not 11
        });

        it('should track rate limits separately per event type', () => {
            const filterPayload = {
                hasFilters: true,
                filterCount: 1,
            };
            const tabPayload = { tabIndex: 1 };

            // Send 10 FilterChanged events
            for (let i = 0; i < 10; i++) {
                eventSystem.dispatch(
                    LightdashEventType.FilterChanged,
                    filterPayload,
                );
            }
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10);

            // TabChanged should still work (separate rate limit)
            eventSystem.dispatch(LightdashEventType.TabChanged, tabPayload);
            expect(dispatchEventSpy).toHaveBeenCalledTimes(11);

            // But another FilterChanged should be blocked
            eventSystem.dispatch(
                LightdashEventType.FilterChanged,
                filterPayload,
            );
            expect(dispatchEventSpy).toHaveBeenCalledTimes(11); // Still 11
        });

        it('should reset rate limit window after 1 second', () => {
            const payload = {
                hasFilters: true,
                filterCount: 1,
            };

            // Fill up the rate limit
            for (let i = 0; i < 10; i++) {
                eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            }
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10);

            // Next event should be blocked
            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10);

            // Advance time by 1001ms to clear the window
            vi.advanceTimersByTime(1001);

            // Should work again
            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            expect(dispatchEventSpy).toHaveBeenCalledTimes(11);
        });

        it('should handle partial window expiry correctly', () => {
            const payload = {
                hasFilters: true,
                filterCount: 1,
            };

            // Send 5 events at time 0
            for (let i = 0; i < 5; i++) {
                eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            }

            // Advance by 500ms
            vi.advanceTimersByTime(500);

            // Send 5 more events (total 10, should all work)
            for (let i = 0; i < 5; i++) {
                eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            }
            expect(dispatchEventSpy).toHaveBeenCalledTimes(10);

            // Advance by another 600ms (total 1100ms from start)
            // First 5 events should now be expired, so we have capacity for more
            vi.advanceTimersByTime(600);

            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);
            expect(dispatchEventSpy).toHaveBeenCalledTimes(11); // Should work
        });
    });

    describe('Integration with iframe embedding', () => {
        it('should demonstrate complete usage for iframe embed scenario', () => {
            // Create event system with specific targetOrigin for this test
            const testEventSystem = new LightdashUiEvent(
                mockConfig,
                'https://customer-app.com',
            );

            // Simulate filter change
            const filterPayload: FilterChangedPayload = {
                hasFilters: true,
                filterCount: 2,
            };

            testEventSystem.dispatch(
                LightdashEventType.FilterChanged,
                filterPayload,
            );

            // Should dispatch both DOM event and postMessage
            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'lightdash:filterChanged',
                    detail: {
                        hasFilters: true,
                        filterCount: 2,
                    },
                }),
            );

            expect(postMessageSpy).toHaveBeenCalledWith(
                {
                    type: 'lightdash:filterChanged',
                    payload: {
                        hasFilters: true,
                        filterCount: 2,
                    },
                    timestamp: expect.any(Number),
                },
                'https://customer-app.com',
            );
        });

        it('should demonstrate usage for React SDK scenario (no iframe)', () => {
            // Mock non-iframe environment
            Object.defineProperty(window, 'parent', {
                value: window, // parent === window means not in iframe
                writable: true,
                configurable: true,
            });

            const tabPayload: TabChangedPayload = {
                tabIndex: 1,
            };

            // Only DOM events should be dispatched, no postMessage
            eventSystem.dispatch(LightdashEventType.TabChanged, tabPayload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).not.toHaveBeenCalled();
        });
    });

    describe('Disabled Configuration', () => {
        beforeEach(() => {
            // Create event system with disabled config
            const disabledConfig: HealthState['embedding']['events'] = {
                enabled: false,
                rateLimiting: mockConfig!.rateLimiting,
                allowedOrigins: mockConfig!.allowedOrigins,
                enablePostMessage: mockConfig!.enablePostMessage,
            };
            eventSystem = new LightdashUiEvent(disabledConfig);
        });

        it('should not dispatch events when configuration is disabled', () => {
            const payload = {
                hasFilters: true,
                filterCount: 1,
            };

            eventSystem.dispatch(LightdashEventType.FilterChanged, payload);

            expect(dispatchEventSpy).not.toHaveBeenCalled();
            expect(postMessageSpy).not.toHaveBeenCalled();
        });
    });

    describe('PostMessage Disabled Configuration', () => {
        beforeEach(() => {
            // Create event system with postMessage disabled
            const noPostMessageConfig: HealthState['embedding']['events'] = {
                enabled: mockConfig!.enabled,
                rateLimiting: mockConfig!.rateLimiting,
                allowedOrigins: mockConfig!.allowedOrigins,
                enablePostMessage: false,
            };
            eventSystem = new LightdashUiEvent(noPostMessageConfig);
        });

        it('should only dispatch DOM events when postMessage is disabled', () => {
            const payload = { tabIndex: 1 };

            eventSystem.dispatch(LightdashEventType.TabChanged, payload);

            expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
            expect(postMessageSpy).not.toHaveBeenCalled();
        });
    });
});
