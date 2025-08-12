/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// This rule is failing in CI but passes locally
import {
    EmbedJwtSchema,
    JWT_HEADER_NAME,
    NotFoundError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { fromJwt } from '../../auth/account';
import { getExternalId } from '../../auth/account/account';
import { decodeLightdashJwt } from '../../auth/lightdashJwt';
import { EmbedService } from '../../ee/services/EmbedService/EmbedService';
import Logger from '../../logging/logger';

/**
 * We don't have the parsed routes yet, so we get the path params in a
 * cheap and dirty way. Long-term, we'll use org-level JWTs rather than project-level.
 */
const parseProjectUuid = (req: Pick<Request, 'query' | 'path'>) => {
    if (req.query.projectUuid) {
        return req.query.projectUuid as string;
    }

    const pathParts = req.path.split('/');
    const projectParams = ['embed', 'projects'];
    const projectUuidIndex =
        pathParts.findIndex((part) => projectParams.includes(part)) + 1;

    if (projectUuidIndex < 1) {
        return undefined;
    }

    return pathParts[projectUuidIndex];
};

/**
 * Middleware to authenticate embed tokens
 * If an embed token is provided, it will be decoded and attached to the request
 * If no embed token is provided, it will call next() to let regular auth middleware handle it
 * We add to `req.user` as well as `req.account`
 */
export async function jwtAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // There are some situations where we'll already have a user and need to still create a
        // JWT account. One example is when an admin is previewing an embed URL.
        if (req.account?.isAuthenticated()) {
            next();
            return;
        }

        if (!req.path.includes('/embed') && req.isAuthenticated()) {
            next();
            return;
        }

        // Extract project UUID from URL path since middleware is applied to /api/v1/embed path
        // The path will be like /api/v1/embed/{projectUuid}/dashboard
        // TODO: This is a hack to get the project UUID because JWT secrets are bound to the project rather than the organization.
        //       https://github.com/lightdash/lightdash/issues/15661
        const projectUuid = parseProjectUuid(req);

        if (!projectUuid) {
            next();
            return;
        }
        req.project = { projectUuid };

        const embedToken = req.headers[JWT_HEADER_NAME];
        if (typeof embedToken !== 'string') {
            next();
            return;
        }

        const embedService = req.services?.getEmbedService() as EmbedService;
        if (!embedService) {
            Logger.error('Services are not initialized for embed token');
            next();
            return;
        }

        // Get embed configuration from database
        const { encodedSecret, organization } =
            await embedService.getEmbeddingByProjectId(projectUuid);
        const decodedToken = decodeLightdashJwt(embedToken, encodedSecret);
        const userAttributesPromise = embedService.getEmbedUserAttributes(
            organization.organizationUuid,
            decodedToken,
        );
        const dashboardUuidPromise = embedService.getDashboardUuidFromJwt(
            decodedToken,
            projectUuid,
        );
        const [dashboardUuid, userAttributes] = await Promise.all([
            dashboardUuidPromise,
            userAttributesPromise,
        ]);

        if (!dashboardUuid) {
            next(
                new NotFoundError('Cannot verify JWT. Dashboard ID not found'),
            );

            return;
        }

        // Check if the token has canEdit claim and needs provisioning
        let registeredUser: SessionUser | undefined;
        if (decodedToken.content.canEdit) {
            // We use strict parsing for write access to ensure we're not missing any required fields
            // Read tokens are permissive when decoding the token.
            const parsedToken = EmbedJwtSchema.parse(decodedToken);

            const userService = req.services?.getUserService();
            if (!userService) {
                Logger.error('UserService is not initialized for embed token');
                next();
                return;
            }

            registeredUser = await userService.findOrCreateEmbedUser(
                getExternalId(decodedToken, embedToken, organization),
                parsedToken.user?.email,
                organization.organizationUuid,
            );
        }

        req.account = fromJwt({
            decodedToken,
            source: embedToken,
            organization,
            dashboardUuid,
            userAttributes,
            registeredUser,
        });

        // Not the greatest, but passport expects this to return a typeguard: this is AuthenticatedRequest.
        // AuthenticatedRequest is not defined and TS won't let us use `this` in a typeguard outside of a class.
        // @ts-expect-error - Passport type here is overly restrictive and doesn't allow overriding.
        req.isAuthenticated = function isAuthenticated() {
            return this.account?.isAuthenticated() || false;
        };

        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const richZodErrors = error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(', ');
            Logger.error(`Token schema validation error: ${richZodErrors}`);
            next(new ParameterError('Token schema validation error'));
            return;
        }
        next(error);
    }
}
