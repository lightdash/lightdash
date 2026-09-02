import { Request, Response } from 'express';
import Logger from '../../logging/logger';
import {
    getDefaultSunsetDate,
    getDeprecatedRouteMiddleware,
} from './deprecation';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: { warn: vi.fn() },
}));

describe('getDefaultSunsetDate', () => {
    it('returns the deprecation date advanced by three months', () => {
        expect(getDefaultSunsetDate(new Date('2026-01-15T00:00:00Z'))).toEqual(
            new Date('2026-04-15T00:00:00Z'),
        );
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

    it('logs a structured warning when the route is called', () => {
        const { res } = buildResponse();
        getDeprecatedRouteMiddleware(new Date('2020-01-01T00:00:00Z'), {
            removeOn: new Date('2020-04-01T00:00:00Z'),
            suffixMessage: 'Use X instead.',
        })(req, res, next);

        expect(Logger.warn).toHaveBeenCalledTimes(1);
        expect(Logger.warn).toHaveBeenCalledWith(
            'Deprecated endpoint called. Use X instead.',
            {
                route: 'GET /api/v1/old',
                deprecatedOn: '2020-01-01T00:00:00.000Z',
                removeOn: '2020-04-01T00:00:00.000Z',
            },
        );
    });
});
