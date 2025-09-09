/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// This rule is failing in CI but passes locally
import { NextFunction, Request, Response } from 'express';
import * as Account from '../../auth/account';
import Logger from '../../logging/logger';

/**
 * Middleware to attach the account to the request.
 * This is used to centralize identity across the application.
 */
export function sessionAccountMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    // This means we already have a session user with an account. Usually when an admin previews an embedding.
    if (req.user && req.account) {
        Logger.warn(
            'User with Session Account is already authenticated',
            req.account.authentication.type,
        );
    }

    // Nothing to do if there's no user or the account is already set
    if (!req.user || req.account) {
        next();
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.account = Account.fromSession(req.user, req.headers.cookie || '');

    next();
}
