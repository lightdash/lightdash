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
    it.each([
        'Bearer ldpat_token',
        'bearer ldpat_token',
        'BEARER ldpat_token',
        'Bearer  ldpat_token',
    ])('aliases a Bearer PAT to ApiKey authentication', (authorization) => {
        const result = runMiddleware(authorization);

        expect(result.authorization).toBe('ApiKey ldpat_token');
        expect(result.next).toHaveBeenCalledOnce();
    });

    it.each([
        'ApiKey ldpat_token',
        'Bearer ldsvc_token',
        'Bearer oauth-token',
        'Bearer',
        '',
        undefined,
    ])('leaves other authorization values unchanged', (authorization) => {
        const result = runMiddleware(authorization);

        expect(result.authorization).toBe(authorization);
        expect(result.next).toHaveBeenCalledOnce();
    });
});
