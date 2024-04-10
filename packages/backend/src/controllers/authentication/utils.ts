import { Request } from 'express';

export const getLoginHint = (req: Request) =>
    req.query?.login_hint && typeof req.query.login_hint === 'string'
        ? req.query.login_hint
        : undefined;
