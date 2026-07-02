import { ParameterError } from '@lightdash/common';
import {
    validateExternalConnectionConfig,
    type ValidatableExternalConnectionConfig,
} from './externalConnectionConfigValidation';

const base: ValidatableExternalConnectionConfig = {
    type: 'none',
    origin: 'https://api.example.com',
    allowedPathPrefixes: ['/v1/'],
    allowedMethods: ['GET'],
    allowedContentTypes: ['application/json'],
};

describe('validateExternalConnectionConfig', () => {
    it('accepts a valid no-auth config', () => {
        expect(() =>
            validateExternalConnectionConfig(base, false),
        ).not.toThrow();
    });

    describe('origin', () => {
        it('rejects non-https', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, origin: 'http://api.example.com' },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('rejects a path on the origin', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, origin: 'https://api.example.com/v1' },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('rejects embedded credentials', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, origin: 'https://user:pass@api.example.com' },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('rejects a non-URL', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, origin: 'not a url' },
                    false,
                ),
            ).toThrow(ParameterError);
        });
    });

    describe('instructions', () => {
        it('accepts absent, null, or reasonably-sized instructions', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, instructions: null },
                    false,
                ),
            ).not.toThrow();
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, instructions: 'Paginate with ?page=.' },
                    false,
                ),
            ).not.toThrow();
        });

        it('rejects instructions over the character cap', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, instructions: 'x'.repeat(10_001) },
                    false,
                ),
            ).toThrow(ParameterError);
        });
    });

    describe('auth invariants', () => {
        it('rejects a none connection that carries a secret', () => {
            expect(() => validateExternalConnectionConfig(base, true)).toThrow(
                ParameterError,
            );
        });

        it('rejects bearer_token without a secret', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, type: 'bearer_token' },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('accepts bearer_token with a secret', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, type: 'bearer_token' },
                    true,
                ),
            ).not.toThrow();
        });

        it('rejects api_key missing name/location', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, type: 'api_key' },
                    true,
                ),
            ).toThrow(ParameterError);
        });

        it('accepts api_key with name + location + secret', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    {
                        ...base,
                        type: 'api_key',
                        apiKeyName: 'X-Api-Key',
                        apiKeyLocation: 'header',
                    },
                    true,
                ),
            ).not.toThrow();
        });
    });

    describe('allowlists and limits', () => {
        it('rejects empty methods', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, allowedMethods: [] },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('rejects an unsupported method', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, allowedMethods: ['TRACE'] },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('accepts the extended write methods', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    {
                        ...base,
                        allowedMethods: [
                            'GET',
                            'POST',
                            'PUT',
                            'PATCH',
                            'DELETE',
                        ],
                    },
                    false,
                ),
            ).not.toThrow();
        });

        it('rejects empty content types', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, allowedContentTypes: [] },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('accepts common structured and text response content types', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    {
                        ...base,
                        allowedContentTypes: [
                            'application/geo+json',
                            'application/x-ndjson',
                            'text/tab-separated-values',
                        ],
                    },
                    false,
                ),
            ).not.toThrow();
        });

        it('rejects path traversal in a prefix', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, allowedPathPrefixes: ['/v1/../secrets'] },
                    false,
                ),
            ).toThrow(ParameterError);
        });

        it('rejects an out-of-bounds timeout', () => {
            expect(() =>
                validateExternalConnectionConfig(
                    { ...base, timeoutMs: 999_999 },
                    false,
                ),
            ).toThrow(ParameterError);
        });
    });
});
