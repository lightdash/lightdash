import { DeprecatedRouteError } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import Logger from '../../logging/logger';
import {
    getDefaultSunsetDate,
    getDeprecatedRouteMiddleware,
    shouldEscalateToError,
} from './deprecation';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getDefaultSunsetDate', () => {
    it('returns the deprecation date advanced by three months', () => {
        expect(getDefaultSunsetDate(new Date('2026-01-15T00:00:00Z'))).toEqual(
            new Date('2026-04-15T00:00:00Z'),
        );
    });
});

describe('shouldEscalateToError', () => {
    const now = new Date('2026-06-08T00:00:00Z');

    it('is false when the removal date is more than two weeks away', () => {
        expect(
            shouldEscalateToError(new Date('2026-07-01T00:00:00Z'), now),
        ).toBe(false);
    });

    it('is true when the removal date is within two weeks', () => {
        expect(
            shouldEscalateToError(new Date('2026-06-15T00:00:00Z'), now),
        ).toBe(true);
    });

    it('is true when the removal date has passed', () => {
        expect(
            shouldEscalateToError(new Date('2026-03-08T00:00:00Z'), now),
        ).toBe(true);
    });
});

describe('getDeprecatedRouteMiddleware', () => {
    const buildResponse = () => {
        const headers: Record<string, string> = {};
        const res = {
            setHeader: vi.fn((key: string, value: string) => {
                headers[key] = value;
            }),
        };
        return { res: res as unknown as Response, headers };
    };
    const req = { method: 'GET', path: '/api/v1/old' } as unknown as Request;
    const next = vi.fn();

    beforeEach(() => vi.clearAllMocks());

    it('sets Deprecation, Sunset and Warning headers', () => {
        const { res, headers } = buildResponse();
        const deprecatedOn = new Date('2026-01-15T00:00:00Z');
        const removeOn = new Date('2099-01-01T00:00:00Z');
        getDeprecatedRouteMiddleware(deprecatedOn, {
            removeOn,
            suffixMessage: 'Use X instead.',
        })(req, res, next);

        expect(headers.Deprecation).toBe(deprecatedOn.toUTCString());
        expect(headers.Sunset).toBe(removeOn.toUTCString());
        expect(headers.Warning).toContain('deprecated');
        expect(headers.Warning).toContain('Use X instead.');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('defaults the removal date to three months after deprecation', () => {
        const { res, headers } = buildResponse();
        getDeprecatedRouteMiddleware(new Date('2026-01-15T00:00:00Z'))(
            req,
            res,
            next,
        );
        expect(headers.Sunset).toBe(
            new Date('2026-04-15T00:00:00Z').toUTCString(),
        );
    });

    it('logs a warning and does not report to Sentry when the removal date is far in the future', () => {
        const { res } = buildResponse();
        getDeprecatedRouteMiddleware(new Date(Date.now()), {
            removeOn: new Date(Date.now() + 365 * DAY_MS),
        })(req, res, next);

        expect(Logger.warn).toHaveBeenCalledTimes(1);
        expect(Logger.error).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('logs an error and reports a DeprecatedRouteError to Sentry when the removal date has passed', () => {
        const { res } = buildResponse();
        getDeprecatedRouteMiddleware(new Date('2020-01-01T00:00:00Z'), {
            removeOn: new Date('2020-04-01T00:00:00Z'),
        })(req, res, next);

        expect(Logger.error).toHaveBeenCalledTimes(1);
        expect(Logger.warn).not.toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalledTimes(1);
        expect(
            (Sentry.captureException as import('vitest').Mock).mock.calls[0][0],
        ).toBeInstanceOf(DeprecatedRouteError);
    });
});
