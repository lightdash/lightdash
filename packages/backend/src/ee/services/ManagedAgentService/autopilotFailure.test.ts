import { APICallError } from 'ai';
import { captureAutopilotFailure, scrubSecrets } from './autopilotFailure';

const setTags = vi.fn();
const setFingerprint = vi.fn();
const captureException = vi.fn();

vi.mock('@sentry/node', async () => {
    const actual =
        await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
    return {
        ...actual,
        withScope: (cb: (scope: unknown) => void) =>
            cb({
                setTags: (...args: unknown[]) => setTags(...args),
                setFingerprint: (...args: unknown[]) => setFingerprint(...args),
            }),
        captureException: (...args: unknown[]) => captureException(...args),
    };
});

const context = {
    stage: 'run' as const,
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    runUuid: 'run-uuid',
    attribution: {
        provider: 'azure',
        model: 'gpt-5.4',
        keyManagement: 'self-managed' as const,
    },
};

describe('scrubSecrets', () => {
    it('redacts keys in headers, bearer tokens and query strings', () => {
        expect(
            scrubSecrets(
                'Request to https://host/v1?api-key=abc123&x=1 failed with x-api-key: sk-ant-api03-verysecretvalue and Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload and AKIAIOSFODNN7EXAMPLE and {"api_key":"plain-value"}',
            ),
        ).toBe(
            'Request to https://host/v1?api-key=[redacted]&x=1 failed with x-api-key: [redacted] and Authorization: Bearer [redacted] and [redacted] and {"api_key":"[redacted]"}',
        );
    });

    it('leaves ordinary messages alone', () => {
        expect(scrubSecrets('Overloaded: retry in 30 seconds')).toBe(
            'Overloaded: retry in 30 seconds',
        );
    });
});

describe('captureAutopilotFailure', () => {
    beforeEach(() => {
        setTags.mockClear();
        setFingerprint.mockClear();
        captureException.mockClear();
    });

    it('reports a scrubbed copy tagged with the provider and fingerprinted by error class', () => {
        const error = new APICallError({
            message: 'Unauthorized: api-key: sk-live-abcdefghijkl was rejected',
            url: 'https://host/v1/messages',
            requestBodyValues: { messages: ['private prompt'] },
            statusCode: 401,
            responseBody: '{"error":"bad key"}',
            isRetryable: false,
        });
        captureAutopilotFailure(error, context);

        expect(setTags).toHaveBeenNthCalledWith(1, {
            'autopilot.stage': 'run',
            'autopilot.runUuid': 'run-uuid',
            'ai.provider': 'azure',
            'ai.model': 'gpt-5.4',
            'ai.keyManagement': 'self-managed',
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
        });
        expect(setTags).toHaveBeenNthCalledWith(2, {
            'ai.statusCode': '401',
            'ai.retryable': 'false',
        });
        expect(setFingerprint).toHaveBeenCalledWith([
            'autopilot',
            'run',
            'azure',
            'AI_APICallError',
        ]);
        const reported = captureException.mock.calls[0][0] as Error;
        expect(reported).not.toBe(error);
        expect(reported.name).toBe('AI_APICallError');
        expect(reported.message).toBe(
            'Unauthorized: api-key: [redacted] was rejected',
        );
        expect(JSON.stringify(reported)).not.toContain('private prompt');
    });

    it('tags unknown attribution and non-error throws', () => {
        captureAutopilotFailure('socket hang up', {
            ...context,
            stage: 'session',
            attribution: null,
        });
        expect(setTags).toHaveBeenCalledWith(
            expect.objectContaining({
                'autopilot.stage': 'session',
                'ai.provider': 'unknown',
                'ai.model': 'unknown',
            }),
        );
        expect(setFingerprint).toHaveBeenCalledWith([
            'autopilot',
            'session',
            'unknown',
            'Error',
        ]);
        expect(captureException.mock.calls[0][0].message).toBe(
            'socket hang up',
        );
    });
});
