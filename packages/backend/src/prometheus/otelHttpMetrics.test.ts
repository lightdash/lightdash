import { shouldSelfRegisterHttpInstrumentation } from './otelHttpMetrics';

describe('shouldSelfRegisterHttpInstrumentation', () => {
    it('registers only when no Sentry DSN and OTel tracing is off', () => {
        // The bug: self-hosted without Sentry — nobody else instruments http.
        expect(
            shouldSelfRegisterHttpInstrumentation({
                hasSentryDsn: false,
                isOtelTracingEnabled: false,
            }),
        ).toBe(true);
    });

    it('does not register when a Sentry DSN is configured (Sentry instruments http)', () => {
        expect(
            shouldSelfRegisterHttpInstrumentation({
                hasSentryDsn: true,
                isOtelTracingEnabled: false,
            }),
        ).toBe(false);
    });

    it('does not register when OTel tracing is enabled (tracing path instruments http)', () => {
        expect(
            shouldSelfRegisterHttpInstrumentation({
                hasSentryDsn: false,
                isOtelTracingEnabled: true,
            }),
        ).toBe(false);
    });

    it('does not register when both a DSN and OTel tracing are set', () => {
        expect(
            shouldSelfRegisterHttpInstrumentation({
                hasSentryDsn: true,
                isOtelTracingEnabled: true,
            }),
        ).toBe(false);
    });
});
