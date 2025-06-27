import {
    Account,
    EmbedJwt,
    ForbiddenError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { NextFunction, Request, Response } from 'express';
import { EmbedService } from '../ee/services/EmbedService/EmbedService';
import Logger from '../logging/logger';
import { decodeJwt, JWT_HEADER_NAME } from '../utils/JwtUtil';

/**
 * We don't have the parsed routes yet, so we get the path params in a
 * cheap and dirty way. Long-term, we could pass the project as a query param.
 */
const parseProjectUuid = (path: string) => {
    const pathParts = path.split('/');
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
 * We add to req.user as well as req.account
 */
export async function jwtAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        // Extract project UUID from URL path since middleware is applied to /api/v1/embed path
        // The path will be like /api/v1/embed/{projectUuid}/dashboard
        const projectUuid = parseProjectUuid(req.path);

        if (!projectUuid) {
            next();
            return;
        }
        req.project = { projectUuid };

        const embedToken = req.headers[JWT_HEADER_NAME] as string;
        if (!embedToken) {
            next();
            return;
        }

        const embedService = req.services.getEmbedService() as EmbedService;
        if (!embedService) {
            Logger.error('Services are not initialized for embed token');
            next();
            return;
        }

        // Get embed configuration from database
        const { encodedSecret, organization } =
            await embedService.getEmbeddingByProjectId(projectUuid);
        const decodedToken = decodeJwt(embedToken, encodedSecret);

        req.account = {
            authentication: {
                type: 'embed',
                data: decodedToken,
                source: embedToken,
            },
            organization,
            // FIXME: This is temporary until we parse user and abilities
            user: {} as SessionUser,
        } as Account<EmbedJwt>;

        next();
    } catch (error) {
        if (
            error instanceof ForbiddenError ||
            error instanceof ParameterError
        ) {
            res.status(403).json({
                status: 'error',
                message: error.message,
            });
        } else {
            // For unexpected errors, let regular auth handle it
            next(error);
        }
    }
}
