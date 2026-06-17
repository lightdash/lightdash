import {
    ForbiddenError,
    getErrorMessage,
    LightdashMode,
} from '@lightdash/common';
import express, { type Router } from 'express';
import { existsSync } from 'fs';
import { verify } from 'jsonwebtoken';
import path from 'path';
import { z } from 'zod';
import { lightdashConfig } from '../config/lightdashConfig';
import { EmbedService } from '../ee/services/EmbedService/EmbedService';
import Logger from '../logging/logger';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const FullAppEmbedJwtSchema = z.object({
    content: z.object({
        type: z.literal('fullApp'),
        projectUuid: z.string().uuid(),
    }),
    user: z.object({
        userUuid: z.string().uuid(),
    }),
    iat: z.number().optional(),
    exp: z.number(),
});

const getFullAppEmbedToken = (token: unknown) =>
    typeof token === 'string' && token.trim() ? token : undefined;

const getFullAppEmbedPath = (targetPath: unknown) =>
    typeof targetPath === 'string' &&
    targetPath.startsWith('/') &&
    !targetPath.startsWith('//')
        ? targetPath
        : '/projects';

const frontendBuildIndexPath = path.join(
    __dirname,
    '../../../frontend/build/index.html',
);

const verifyFullAppEmbedJwt = (token: string, secret: string) => {
    let payload: unknown;
    try {
        payload = verify(token, secret);
    } catch {
        throw new ForbiddenError('Invalid full app embed token');
    }

    const decodedToken = FullAppEmbedJwtSchema.safeParse(payload);
    if (!decodedToken.success) {
        throw new ForbiddenError('Invalid full app embed token');
    }

    return decodedToken.data;
};

const setFullAppEmbedHeaders = (res: express.Response) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

export const fullAppEmbedRouter: Router = express.Router({
    mergeParams: true,
});

fullAppEmbedRouter.get('/:projectUuid', async (req, res, next) => {
    try {
        const { projectUuid } = req.params;
        const token = getFullAppEmbedToken(req.query.token);

        if (!projectUuid) {
            throw new ForbiddenError('Missing full app embed token');
        }

        if (!token) {
            if (req.isAuthenticated()) {
                next();
                return;
            }

            throw new ForbiddenError('Missing full app embed token');
        }

        const embedService = req.services.getEmbedService<EmbedService>();
        const embedConfig =
            await embedService.getEmbeddingByProjectId(projectUuid);
        const secret = new EncryptionUtil({ lightdashConfig }).decrypt(
            Buffer.from(embedConfig.encodedSecret),
        );
        const decodedToken = verifyFullAppEmbedJwt(token, secret);

        if (decodedToken.content.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'Full app embed token project does not match URL project',
            );
        }

        const sessionUser = await req.services
            .getUserService()
            .getSessionByUserUuidAndOrg(
                decodedToken.user.userUuid,
                embedConfig.organization.organizationUuid,
            );

        if (!sessionUser.isActive) {
            throw new ForbiddenError('User is deactivated');
        }

        req.login(sessionUser, (loginError) => {
            if (loginError) {
                next(loginError);
                return;
            }

            req.session.save((saveError) => {
                if (saveError) {
                    next(saveError);
                    return;
                }

                Logger.info(
                    `Full app embed session created for user ${sessionUser.userUuid} in project ${projectUuid}`,
                );

                setFullAppEmbedHeaders(res);

                if (
                    lightdashConfig.mode === LightdashMode.DEV ||
                    !existsSync(frontendBuildIndexPath)
                ) {
                    const redirectUrl = new URL(
                        getFullAppEmbedPath(req.query.path),
                        lightdashConfig.siteUrl,
                    );
                    res.redirect(redirectUrl.toString());
                    return;
                }

                next();
            });
        });
    } catch (error) {
        Logger.warn(`Full app embed login failed: ${getErrorMessage(error)}`);
        next(error);
    }
});
