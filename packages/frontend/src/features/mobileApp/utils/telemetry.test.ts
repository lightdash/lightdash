import { type Event } from '@sentry/react';
import { describe, expect, it } from 'vitest';
import {
    redactMobileSetupBreadcrumb,
    redactMobileSetupEvent,
    redactMobileSetupUrl,
} from './telemetry';

const secretUrl =
    'https://app.example.com/mobile-setup?v=2&c=SECRET&i=https%3A%2F%2Fapp.example.com';

describe('mobile setup telemetry', () => {
    it('removes setup secrets from URLs while retaining route context', () => {
        expect(redactMobileSetupUrl(secretUrl)).toContain(
            '/mobile-setup?v=2&c=[redacted]&i=',
        );
        expect(redactMobileSetupUrl(`${secretUrl}&c=OTHER`)).not.toContain(
            'OTHER',
        );
        expect(redactMobileSetupUrl('/chart?field=country')).toBe(
            '/chart?field=country',
        );
    });

    it('redacts navigation and request breadcrumbs before recording them', () => {
        const result = redactMobileSetupBreadcrumb({
            message: secretUrl,
            data: { from: secretUrl, to: secretUrl, url: secretUrl },
        });
        expect(JSON.stringify(result)).not.toContain('SECRET');
    });

    it('redacts error and transaction request URLs, referers and spans', () => {
        const event: Event = {
            request: { url: secretUrl, headers: { Referer: secretUrl } },
            breadcrumbs: [{ data: { url: secretUrl } }],
            spans: [
                {
                    span_id: 'abc',
                    trace_id: 'def',
                    start_timestamp: 1,
                    timestamp: 2,
                    description: `GET ${secretUrl}`,
                    data: { 'http.url': secretUrl },
                },
            ],
        };
        expect(JSON.stringify(redactMobileSetupEvent(event))).not.toContain(
            'SECRET',
        );
    });
});
