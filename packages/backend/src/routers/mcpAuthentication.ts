import { AuthTokenPrefix } from '@lightdash/common';
import type { RequestHandler } from 'express';

// MCP clients with static Bearer credentials cannot send the `ApiKey` scheme.
// Auth schemes are case-insensitive (RFC 7235), so match `bearer` in any case.
const bearerPersonalAccessTokenScheme = new RegExp(
    `^Bearer\\s+(?=${AuthTokenPrefix.PERSONAL_ACCESS_TOKEN})`,
    'i',
);

export const aliasMcpBearerPersonalAccessToken: RequestHandler = (
    req,
    _res,
    next,
) => {
    const { authorization } = req.headers;
    if (authorization) {
        req.headers.authorization = authorization.replace(
            bearerPersonalAccessTokenScheme,
            'ApiKey ',
        );
    }

    next();
};
