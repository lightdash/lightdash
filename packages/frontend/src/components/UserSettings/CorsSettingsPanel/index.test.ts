import { describe, expect, test } from 'vitest';
import {
    getInitialCorsAllowedDomainsInput,
    getRegexPatternInput,
    normalizeCorsAllowedDomainsInput,
    validateCorsAllowedDomainsInput,
} from './utils';

describe('CorsSettingsPanel helpers', () => {
    test('uses one empty input when there are no saved domains', () => {
        expect(getInitialCorsAllowedDomainsInput([])).toEqual([
            { type: 'origin', value: '' },
        ]);
    });

    test('uses saved domains as one input per entry', () => {
        expect(
            getInitialCorsAllowedDomainsInput([
                'https://app.example.com',
                '/^https:\\/\\/.*\\.example\\.com$/',
            ]),
        ).toEqual([
            { type: 'origin', value: 'https://app.example.com' },
            { type: 'regex', value: 'https:\\/\\/.*\\.example\\.com' },
        ]);
    });

    test('normalizes inputs into trimmed API allowed domains', () => {
        expect(
            normalizeCorsAllowedDomainsInput([
                { type: 'origin', value: ' https://app.example.com ' },
                { type: 'origin', value: ' *.example.com ' },
                { type: 'origin', value: ' http://*.test.com ' },
                { type: 'origin', value: '' },
                {
                    type: 'regex',
                    value: ' https:\\/\\/.*\\.example\\.com ',
                },
            ]),
        ).toEqual([
            'https://app.example.com',
            '/^https:\\/\\/.*\\.example\\.com$/',
            '/^http:\\/\\/.*\\.test\\.com$/',
            '/^https:\\/\\/.*\\.example\\.com$/',
        ]);
    });

    test('strips regex delimiters and anchors from pasted regex values', () => {
        expect(getRegexPatternInput('/^https:\\/\\/.*\\.example\\.com$/')).toBe(
            'https:\\/\\/.*\\.example\\.com',
        );
    });

    test('accepts exact origins, wildcard origins, and regex patterns', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'origin', value: 'https://app.example.com' },
                { type: 'origin', value: '*.example.com' },
                { type: 'origin', value: 'http://*.test.com' },
                {
                    type: 'regex',
                    value: 'https:\\/\\/.*\\.lightdash\\.com',
                },
            ]),
        ).toEqual({});
    });

    test('rejects invalid regex patterns', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'origin', value: 'https://app.example.com' },
                { type: 'regex', value: 'unterminated[' },
            ]),
        ).toEqual({
            'corsAllowedDomains.1.value':
                'CORS regex patterns must be valid JavaScript regular expressions.',
        });
    });

    test('rejects broad regex patterns', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'regex', value: 'https?:\\/\\/.*' },
            ]),
        ).toEqual({
            'corsAllowedDomains.0.value':
                'CORS regex patterns cannot match arbitrary external origins.',
        });
    });

    test('rejects exact origins in regex mode', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'regex', value: 'https://lightdash.com' },
            ]),
        ).toEqual({
            'corsAllowedDomains.0.value':
                'Use origin mode for exact origins, or escape regex dots like https:\\/\\/lightdash\\.com.',
        });
    });

    test('rejects origins with paths', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'origin', value: 'https://app.example.com' },
                { type: 'origin', value: 'https://app.example.com/path' },
            ]),
        ).toEqual({
            'corsAllowedDomains.1.value':
                'CORS origins must not include a path, query string, hash, or trailing slash.',
        });
    });

    test('rejects duplicate origins on the duplicated row', () => {
        expect(
            validateCorsAllowedDomainsInput([
                { type: 'origin', value: 'https://app.example.com' },
                { type: 'origin', value: 'https://app.example.com' },
            ]),
        ).toEqual({
            'corsAllowedDomains.1.value':
                'CORS allowed origins must be unique.',
        });
    });
});
