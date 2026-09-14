import {
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotFoundError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAgentRecoverableError, toolErrorHandler } from './toolErrorHandler';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

describe('isAgentRecoverableError', () => {
    it('treats 4xx LightdashErrors as the agent’s own mistake', () => {
        expect(
            isAgentRecoverableError(new WarehouseQueryError('bad sql')),
        ).toBe(true);
        expect(isAgentRecoverableError(new NotFoundError('no chart'))).toBe(
            true,
        );
        expect(isAgentRecoverableError(new ForbiddenError())).toBe(true);
    });

    it('treats 5xx LightdashErrors and non-Lightdash errors as incidents', () => {
        expect(isAgentRecoverableError(new UnexpectedServerError('boom'))).toBe(
            false,
        );
        expect(isAgentRecoverableError(new Error('plain'))).toBe(false);
        expect(isAgentRecoverableError('string')).toBe(false);
    });

    it('treats infrastructure failures as incidents even though they are 4xx', () => {
        expect(
            isAgentRecoverableError(new WarehouseConnectionError('down')),
        ).toBe(false);
        expect(
            isAgentRecoverableError(
                new MissingWarehouseCredentialsError('no credentials'),
            ),
        ).toBe(false);
    });
});

describe('toolErrorHandler', () => {
    beforeEach(() => {
        captureException.mockClear();
    });

    it('hands the error back to the model as a retryable message', () => {
        const result = toolErrorHandler(
            new WarehouseQueryError('Conversion Error: bad cast'),
            'Error running SQL query.',
        );

        expect(result).toContain('Error running SQL query.');
        expect(result).toContain('Conversion Error: bad cast');
        expect(result).toContain('Try again');
    });

    it('does not page Sentry for an error the model can recover from', () => {
        toolErrorHandler(
            new WarehouseQueryError('Conversion Error: bad cast'),
            'Error running SQL query.',
        );

        expect(captureException).not.toHaveBeenCalled();
    });

    it('pages Sentry for an incident', () => {
        const error = new WarehouseConnectionError('warehouse unreachable');

        toolErrorHandler(error, 'Error running query.');

        expect(captureException).toHaveBeenCalledWith(error);
    });

    it('lets a tool override the classification explicitly', () => {
        const recoverable = new NotFoundError('no chart');
        toolErrorHandler(recoverable, 'Error.', { captureToSentry: true });
        expect(captureException).toHaveBeenCalledWith(recoverable);

        captureException.mockClear();
        const incident = new Error('plain');
        toolErrorHandler(incident, 'Error.', { captureToSentry: false });
        expect(captureException).not.toHaveBeenCalled();
    });
});
