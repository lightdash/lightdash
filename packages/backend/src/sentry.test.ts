import * as Sentry from '@sentry/node';
import { errorsOnlyIntegrations, selfHostedIntegrations } from './sentry';
import { sensitiveUploadHttpOptions } from './sentry/sensitiveUploadHttpOptions';

vi.mock('@sentry/node', async () => {
    const actual =
        await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
    return {
        ...actual,
        init: vi.fn(),
        httpIntegration: vi.fn(actual.httpIntegration),
    };
});
vi.mock('./prometheus/otelHttpMetrics', () => ({
    initOtelHttpMetrics: vi.fn(),
    shouldSelfRegisterHttpInstrumentation: () => false,
}));
vi.mock('./tracing/tracing', () => ({ otelTracingEnabled: () => false }));
beforeEach(() => vi.clearAllMocks());

test('self-hosted HTTP uses the shared attachment-body privacy policy without disabling spans', () => {
    const integrations = selfHostedIntegrations();
    expect(integrations.some(({ name }) => name === 'Http')).toBe(true);
    expect(vi.mocked(Sentry.httpIntegration).mock.calls[0]?.[0]).toBe(
        sensitiveUploadHttpOptions,
    );
    expect(
        vi.mocked(Sentry.httpIntegration).mock.calls[0]?.[0],
    ).not.toHaveProperty('spans');
});

test('errors-only HTTP uses exactly the same attachment-body predicate while preserving span stripping', () => {
    const integrations = errorsOnlyIntegrations([
        { name: 'Http' },
        { name: 'Express' },
        { name: 'RequestData' },
        { name: 'CustomAudit' },
    ]);
    expect(integrations.map(({ name }) => name)).toEqual([
        'RequestData',
        'CustomAudit',
        'Http',
        'NodeFetch',
    ]);
    expect(Sentry.httpIntegration).toHaveBeenCalledExactlyOnceWith({
        spans: false,
        ...sensitiveUploadHttpOptions,
    });
    expect(
        vi.mocked(Sentry.httpIntegration).mock.calls[0]?.[0]
            ?.ignoreIncomingRequestBody,
    ).toBe(sensitiveUploadHttpOptions.ignoreIncomingRequestBody);
});
