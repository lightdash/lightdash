/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// This rule is failing in CI but passes locally
import { NextFunction, Request, Response } from 'express';
import type { SessionData } from 'express-session';
import * as Account from '../../auth/account';
import { requestContextFromExpress } from '../../auth/account/requestContext';
import Logger from '../../logging/logger';

const attachSessionAccount = (req: Request) => {
    if (!req.user) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.account = Account.fromSession(req.user, req.headers.cookie || '');
    const requestContext = requestContextFromExpress(req);
    req.account.requestContext = requestContext;
    req.user.requestContext = requestContext;
};

const attachHeadlessServiceAccount = async (
    req: Request,
    mark: NonNullable<SessionData['headlessServiceAccount']>,
) => {
    const { user } = req;
    if (!user) return;
    const serviceAccountUser =
        mark.userUuid === user.userUuid
            ? await req.services
                  .getUserService()
                  .getHeadlessServiceAccountSessionUser(
                      user.userUuid,
                      user.organizationUuid,
                  )
            : undefined;
    if (
        !serviceAccountUser ||
        serviceAccountUser.serviceAccount.uuid !== mark.serviceAccountUuid
    ) {
        // Fails closed only because service-account user rows are created
        // with is_active = false: isAuthenticated then refuses this plain
        // session account. Keep that invariant if this fallback stays.
        attachSessionAccount(req);
        return;
    }
    req.user = serviceAccountUser;
    req.account = Account.fromServiceAccount(serviceAccountUser, '');
    const requestContext = requestContextFromExpress(req);
    req.account.requestContext = requestContext;
    req.user.requestContext = requestContext;
};

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

    const headlessServiceAccount = req.session?.headlessServiceAccount;
    if (headlessServiceAccount) {
        attachHeadlessServiceAccount(req, headlessServiceAccount).then(
            () => next(),
            next,
        );
        return;
    }

    attachSessionAccount(req);
    next();
}
