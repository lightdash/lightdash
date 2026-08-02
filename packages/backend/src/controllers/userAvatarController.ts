import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUserAvatarResponse,
    assertRegisteredAccount,
    ParameterError,
    type UUID,
} from '@lightdash/common';
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const bufferRequestBody = async (req: express.Request): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > MAX_AVATAR_BYTES) {
            throw new ParameterError('Image must be smaller than 5MB');
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

@Route('/api/v1/user/me/avatar')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
export class UserAvatarController extends BaseController {
    /**
     * Upload a profile avatar. Send raw image bytes as the body with an
     * image/png, image/jpeg or image/webp Content-Type. The image is
     * center-cropped, resized and re-encoded server-side.
     * @summary Upload avatar
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('UpdateMyAvatar')
    async updateMyAvatar(
        @Request() req: express.Request,
    ): Promise<ApiUserAvatarResponse> {
        assertRegisteredAccount(req.account);
        const contentType = req.headers['content-type'];
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            throw new ParameterError(
                `Content-Type must be one of: ${ALLOWED_CONTENT_TYPES.join(
                    ', ',
                )}`,
            );
        }
        const body = await bufferRequestBody(req);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .updateAvatar(req.user!, body),
        };
    }

    /**
     * Remove the current user's uploaded avatar.
     * @summary Delete avatar
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('DeleteMyAvatar')
    async deleteMyAvatar(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services.getUserService().deleteAvatar(req.user!);
        return { status: 'ok', results: undefined };
    }
}

@Route('/api/v1/users')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
export class UsersAvatarController extends BaseController {
    /**
     * Serve a user's avatar image. Content-addressed by hash, so responses
     * are immutable and cached by the browser indefinitely.
     * @summary Get user avatar
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{userUuid}/avatar/{contentHash}')
    @OperationId('GetUserAvatar')
    async getUserAvatar(
        @Request() req: express.Request,
        @Path() userUuid: UUID,
        @Path() contentHash: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const image = await this.services
            .getUserService()
            .getAvatarImage(req.user!, userUuid, contentHash);
        const { res } = req as express.Request & { res: express.Response };
        res.status(200);
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Length', String(image.length));
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.setHeader('ETag', `"${contentHash}"`);
        res.send(image);
    }
}
