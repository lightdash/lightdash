import {
    sanitizeAuthTelemetry,
    sanitizeRequestUrl,
} from './sanitizeAuthTelemetry';

describe('sanitizeAuthTelemetry', () => {
    it('removes QR and verification secrets from errors, spans, breadcrumbs and request data', () => {
        const event = {
            request: {
                url: 'https://example.com/mobile-setup?v=2&c=qr-secret',
                data: {
                    code: 'qr-secret',
                    verification_code: '012345',
                    code_verifier: 'phone-secret',
                },
            },
            spans: [
                { data: { 'http.url': '/mobile-setup?c=qr-secret&i=example' } },
            ],
            breadcrumbs: [{ data: { url: '/mobile-setup?c=qr-secret' } }],
            extra: {
                verificationCode: '012345',
                outcome: 'verification_failed',
            },
        };
        const sanitized = JSON.stringify(sanitizeAuthTelemetry(event));
        for (const secret of ['qr-secret', '012345', 'phone-secret'])
            expect(sanitized).not.toContain(secret);
        expect(sanitized).toContain('verification_failed');
        expect(event.request.data.verification_code).toBe('012345');
    });
    it('redacts encoded names, form bodies and serialized JSON bodies', () => {
        expect(sanitizeRequestUrl('/mobile-setup?%63=hidden')).toBe(
            '/mobile-setup?%63=[REDACTED]',
        );
        expect(
            sanitizeAuthTelemetry({
                data: 'code=hidden&verification_code=012345',
            }),
        ).toEqual({ data: 'code=[REDACTED]&verification_code=[REDACTED]' });
        expect(
            sanitizeAuthTelemetry({
                data: '{"code_verifier":"hidden","verification_code":"012345"}',
            }),
        ).toEqual({
            data: '{"code_verifier":"[REDACTED]","verification_code":"[REDACTED]"}',
        });
    });
});
