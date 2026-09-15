import { WarehouseQueryError, type ApiError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { classifyFieldValueSearchError } from './fieldValueSearchError';

const apiError = (name: string, message: string): ApiError => ({
    status: 'error',
    error: { name, statusCode: 400, message, data: {} },
});

describe('classifyFieldValueSearchError', () => {
    it('treats missing explores and fields as configuration problems', () => {
        expect(
            classifyFieldValueSearchError(
                apiError('NotFoundError', 'Explore orders does not exist'),
            ),
        ).toEqual({
            kind: 'configuration',
            detail: 'Explore orders does not exist',
        });
        expect(
            classifyFieldValueSearchError(
                apiError('ParameterError', 'orders_total is a metric'),
            ).kind,
        ).toBe('configuration');
    });

    it('hides the backend message for forbidden errors', () => {
        expect(
            classifyFieldValueSearchError(
                apiError('ForbiddenError', 'Insufficient permissions'),
            ),
        ).toEqual({ kind: 'forbidden', detail: null });
    });

    it('classifies warehouse failures from both request paths', () => {
        expect(
            classifyFieldValueSearchError(
                apiError('WarehouseQueryError', 'relation does not exist'),
            ),
        ).toEqual({ kind: 'warehouse', detail: 'relation does not exist' });
        expect(
            classifyFieldValueSearchError(
                new WarehouseQueryError('Field value search timed out.'),
            ),
        ).toEqual({
            kind: 'warehouse',
            detail: 'Field value search timed out.',
        });
    });

    it('falls back to unknown for anything else', () => {
        expect(
            classifyFieldValueSearchError(
                apiError('UnexpectedServerError', 'boom'),
            ),
        ).toEqual({ kind: 'unknown', detail: 'boom' });
        expect(classifyFieldValueSearchError(new Error('  '))).toEqual({
            kind: 'unknown',
            detail: null,
        });
        expect(classifyFieldValueSearchError(undefined)).toEqual({
            kind: 'unknown',
            detail: null,
        });
    });
});
