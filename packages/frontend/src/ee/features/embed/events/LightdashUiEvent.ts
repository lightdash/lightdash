import type { HealthState } from '@lightdash/common';
import { addBreadcrumb, captureException } from '@sentry/react';
import { type Exact } from 'type-fest';
import {
    type LightdashEmbedEvent,
    type LightdashEventPayload,
    type LightdashEventType,
} from './types';

/**
 * LightdashUiEvent class for dispatching secure events in embedded dashboards.
 *
 * This class provides a secure event system that:
 * - Dispatches DOM CustomEvents for all scenarios
 * - Optionally sends postMessage for iframe embedding with strict security
 * - Implements rate limiting to prevent event flooding
 * - Requires explicit targetOrigin for postMessage
 * - Validates embed context via pathname
 */
export class LightdashUiEvent {
    private static NAMESPACE = 'lightdash:';

    /** Configuration fetched from the health endpoint */
    private config: NonNullable<HealthState['embedding']['events']>;

    /** Target origin for postMessage, validated against allowedOrigins */
    private targetOrigin?: string;

    /** Rate limiting map: eventType -> array of timestamps */
    private rateLimitMap = new Map<string, number[]>();

    constructor(
        config: HealthState['embedding']['events'],
        targetOrigin?: string,
    ) {
        if (!config) {
            throw new Error('Config is required');
        }

        this.config = config;

        // Validate targetOrigin against allowedOrigins if provided
        if (targetOrigin) {
            if (!config.allowedOrigins.includes(targetOrigin)) {
                addBreadcrumb({
                    category: 'embed.validation',
                    message: 'Target origin not in allowed list',
                    level: 'warning',
                    data: {
                        targetOrigin,
                        allowedOrigins: config.allowedOrigins,
                    },
                });
                this.targetOrigin = undefined;
            } else {
                this.targetOrigin = targetOrigin;
            }
        }
    }

    /**
     * Extracts and validates targetOrigin from URL parameters.
     * Returns the origin if it's valid, undefined otherwise.
     *
     * @returns The target origin from URL parameters, or undefined if not present/invalid
     */
    static getTargetOriginFromUrl(): string | undefined {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const targetOrigin = urlParams.get('targetOrigin');

            if (!targetOrigin) {
                return undefined;
            }

            // Validate it's a proper URL format
            new URL(targetOrigin);

            return targetOrigin;
        } catch (error) {
            addBreadcrumb({
                category: 'embed.url',
                message: 'Invalid targetOrigin in URL parameters',
                level: 'warning',
                data: {
                    error:
                        error instanceof Error ? error.message : String(error),
                    url: window.location.href,
                },
            });
            return undefined;
        }
    }

    /**
     * Dispatches a Lightdash event with the specified type and payload.
     *
     * @param eventType - The type of event to dispatch
     * @param payload - The event payload (will be sanitized)
     */
    dispatch<T extends Exact<LightdashEventPayload, T> | undefined>(
        eventType: LightdashEventType,
        payload?: T,
    ): void {
        if (!this.config.enabled) {
            return;
        }

        // Check rate limiting using backend configuration
        if (this.exceedsRateLimit(eventType)) {
            addBreadcrumb({
                category: 'embed.rateLimit',
                message: 'Rate limit exceeded for event',
                level: 'warning',
                data: {
                    eventType,
                    maxEventsPerWindow:
                        this.config.rateLimiting.maxEventsPerWindow,
                    windowDurationMs: this.config.rateLimiting.windowDurationMs,
                },
            });
            return;
        }

        // Always dispatch DOM event
        const eventName = `${LightdashUiEvent.NAMESPACE}${eventType}`;
        const customEvent = new CustomEvent(eventName, {
            detail: payload,
            bubbles: true,
        });
        window.dispatchEvent(customEvent);

        // Conditionally send postMessage with security checks
        if (this.shouldSendPostMessage()) {
            this.sendSecurePostMessage(eventName, payload);
        }
    }

    /**
     * Determines if postMessage should be sent based on security criteria.
     * If all security checks pass, returns true.
     */
    private shouldSendPostMessage(): boolean {
        // Security check 1: Backend configuration must be available and postMessage enabled
        if (!this.config.enablePostMessage) {
            return false;
        }

        // Security check 2: Must have a valid targetOrigin (validated in constructor)
        if (!this.targetOrigin) {
            return false;
        }

        // Security check 3: Must be in embed context (pathname starts with /embed/)
        const pathname = window.location.pathname;
        if (!pathname.startsWith('/embed/')) {
            return false;
        }

        // Security check 4: Must be in iframe (parent !== window)
        if (window.parent === window) {
            return false;
        }

        return true;
    }

    /**
     * Sends a secure postMessage to the parent window.
     *
     * @param eventName - Namespaced event name
     * @param payload - Sanitized payload
     */
    private sendSecurePostMessage(
        eventName: string,
        payload?: LightdashEventPayload,
    ): void {
        if (!this.targetOrigin) {
            captureException(new Error('No target origin configured'), {
                level: 'error',
                tags: {
                    errorType: 'embed.configuration',
                    context: 'postMessage',
                },
                extra: {
                    eventName,
                    hasConfig: !!this.config,
                    enablePostMessage: this.config?.enablePostMessage,
                },
            });
            return;
        }

        try {
            // Validate origin is a proper URL
            new URL(this.targetOrigin);

            const message: LightdashEmbedEvent<
                LightdashEventPayload | undefined
            > = {
                type: eventName,
                payload,
                timestamp: Date.now(),
            };

            window.parent.postMessage(message, this.targetOrigin);
        } catch (error) {
            captureException(new Error('Invalid target origin'), {
                level: 'error',
                tags: {
                    errorType: 'embed.validation',
                    context: 'postMessage',
                },
                extra: {
                    targetOrigin: this.targetOrigin,
                    eventName,
                    originalError:
                        error instanceof Error ? error.message : String(error),
                },
            });
        }
    }

    /**
     * Checks if an event can be dispatched within rate limits.
     *
     * @param eventType - Type of event to check
     * @returns true if within rate limit, false otherwise
     */
    private exceedsRateLimit(eventType: string): boolean {
        const now = Date.now();
        const events = this.rateLimitMap.get(eventType) || [];

        // Remove events outside the rate limit window
        const recentEvents = events.filter(
            (timestamp) =>
                now - timestamp < this.config!.rateLimiting.windowDurationMs,
        );

        // Check if we've exceeded the limit
        if (
            recentEvents.length >= this.config!.rateLimiting.maxEventsPerWindow
        ) {
            return true;
        }

        // Add current event and update the map
        recentEvents.push(now);
        this.rateLimitMap.set(eventType, recentEvents);

        return false;
    }
}
