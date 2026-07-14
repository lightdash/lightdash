import type { NextFunction, Request, Response } from 'express';
import { aliasMcpBearerPersonalAccessToken } from './mcpAuthentication';

const runMiddleware = (authorization?: string) => {
    const request = {
        headers: { authorization },
    } as Request;
    const next = vi.fn() as NextFunction;

    aliasMcpBearerPersonalAccessToken(request, {} as Response, next);

    return { authorization: request.headers.authorization, next };
};

describe('aliasMcpBearerPersonalAccessToken', () => {
    it('aliases a Bearer PAT to ApiKey authentication', () => {
        const result = runMiddleware('Bearer ldpat_token');

        expect(result.authorization).toBe('ApiKey ldpat_token');
        expect(result.next).toHaveBeenCalledOnce();
    });

    it.each([
        'ApiKey ldpat_token',
        'Bearer ldsvc_token',
        'Bearer oauth-token',
        undefined,
    ])('leaves other authorization values unchanged', (authorization) => {
        const result = runMiddleware(authorization);

        expect(result.authorization).toBe(authorization);
        expect(result.next).toHaveBeenCalledOnce();
    });
});
