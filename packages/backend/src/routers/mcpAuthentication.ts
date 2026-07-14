import { AuthTokenPrefix } from '@lightdash/common';
import type { RequestHandler } from 'express';

const personalAccessTokenBearerPrefix = `Bearer ${AuthTokenPrefix.PERSONAL_ACCESS_TOKEN}`;

export const aliasMcpBearerPersonalAccessToken: RequestHandler = (
    req,
    _res,
    next,
) => {
    const { authorization } = req.headers;
    if (authorization?.startsWith(personalAccessTokenBearerPrefix)) {
        req.headers.authorization = authorization.replace(
            /^Bearer /,
            'ApiKey ',
        );
    }

    next();
};
