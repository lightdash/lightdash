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

    it('redacts every locator and never leaves a quoted object-key suffix', () => {
        expect(
            sanitizeDuckdbError(
                'Failed [s3://bucket/private-a.parquet], then "s3://bucket/private-b.csv?token=secret"',
            ),
        ).toBe(
            'Failed [[external source data]], then "[external source data]"',
        );
    });

    it('redacts a presigned external-source URL including its credentials', () => {
        expect(
            sanitizeDuckdbError(
                "GET 'https://storage.example.com/external-sources/project/file.parquet?X-Amz-Credential=secret&X-Amz-Signature=private' failed",
            ),
        ).toBe("GET '[external source data]' failed");
    });

    it('does not redact unrelated HTTP URLs', () => {
        const message =
            'Request to https://docs.example.com/external-data/help failed';
        expect(sanitizeDuckdbError(message)).toBe(message);
    });

    it('handles long malformed input without an unbounded wildcard', () => {
        const locator = `s3://bucket/${'a'.repeat(50_000)}`;
        expect(sanitizeDuckdbError(`Failed ${locator}`)).toBe(
            'Failed [external source data]',
        );
    });
});
