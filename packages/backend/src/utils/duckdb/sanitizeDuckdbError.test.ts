import { describe, expect, it } from 'vitest';
import { sanitizeDuckdbError } from './sanitizeDuckdbError';

describe('sanitizeDuckdbError', () => {
    it('redacts S3 locators while preserving useful context', () => {
        expect(
            sanitizeDuckdbError(
                new Error(
                    'Could not read s3://private-bucket/external-sources/project/source/v1.csv: file not found',
                ),
            ),
        ).toBe('Could not read [external source data]: file not found');
    });

    it('preserves errors without a locator', () => {
        expect(sanitizeDuckdbError(new Error('Invalid CSV header'))).toBe(
            'Invalid CSV header',
        );
    });

    it('redacts an HTTP storage URL containing the object key', () => {
        expect(
            sanitizeDuckdbError(
                'HTTP 404 at https://storage.example.com/bucket/external-sources/project/source/v1.parquet: missing',
            ),
        ).toBe('HTTP 404 at [external source data]: missing');
    });
});
