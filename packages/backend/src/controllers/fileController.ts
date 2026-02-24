import { ApiErrorPayload, NotFoundError } from '@lightdash/common';
import {
    Get,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from './baseController';

const NANOID_REGEX = /^[\w-]{21}$/;

@Route('/api/v1/file')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Files')
export class FileController extends BaseController {
    /**
     * Get a persistent file download via redirect
     * @summary Get file
     * @param fileId the persistent file nanoid
     */
    @Get('{fileId}')
    @OperationId('getFile')
    async getFile(
        @Path() fileId: string,
        @Request() req: express.Request,
    ): Promise<void> {
        if (!NANOID_REGEX.test(fileId)) {
            throw new NotFoundError('Cannot find file');
        }

        const signedUrl = await this.services
            .getPersistentDownloadFileService()
            .getSignedUrl(fileId, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                requestedByUserUuid: req.user?.userUuid,
            });

        this.setStatus(302);
        this.setHeader('Location', signedUrl);
        this.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
}
