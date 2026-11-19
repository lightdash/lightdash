import { ForbiddenError, getErrorMessage } from '@lightdash/common';
import express, { type Router } from 'express';
import type { CookieOptions } from 'express-session';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { getMcpAppRedirectPath } from './mcpAppRedirectPath';

export const mcpAppRouter: Router = express.Router({ mergeParams: true });

mcpAppRouter.get('/sign-in', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const { token } = req.query;
        if (typeof token !== 'string') {
            throw new ForbiddenError();
        }
        const redirectPath = getMcpAppRedirectPath(
            req.query.redirect,
            lightdashConfig.siteUrl,
        );

        const userUuid = await req.services
            .getHeadlessBrowserService()
            .consumeLoginGrant(token);
        if (userUuid === null) {
            throw new ForbiddenError();
        }

        const userService = req.services.getUserService();
        if (await userService.getHeadlessServiceAccountSessionUser(userUuid)) {
            throw new ForbiddenError();
        }
        const sessionUser = await userService.getSessionByUserUuid(userUuid);

        req.login(sessionUser, (loginError) => {
            if (loginError) {
                next(loginError);
                return;
            }
            const cookie: CookieOptions = req.session.cookie;
            cookie.sameSite = 'none';
            cookie.secure = true;
            cookie.partitioned = true;
            req.session.save((saveError) => {
                if (saveError) {
                    next(saveError);
                    return;
                }
                res.redirect(redirectPath);
            });
        });
    } catch (e) {
        Logger.warn(`MCP App sign-in failed: ${getErrorMessage(e)}`);
        next(e);
    }
});
