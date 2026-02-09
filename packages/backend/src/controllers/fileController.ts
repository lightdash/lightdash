import { ApiErrorPayload } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { optionalAuthentication } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/file')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Files')
export class FileController extends BaseController {
    /**
     * Get a persistent file download via redirect
     * @summary Get file
     * @param fileId the persistent file nanoid
     * @param req express request
     */
    @Middlewares([optionalAuthentication])
    @Get('{fileId}')
    @OperationId('getFile')
    async getFile(
        @Path() fileId: string,
        @Request() req: express.Request,
    ): Promise<void> {
        if (!req.user?.organizationUuid) {
            const redirectPath = `/api/v1/file/${fileId}`;
            this.setStatus(302);
            this.setHeader(
                'Location',
                `/login?redirect=${encodeURIComponent(redirectPath)}`,
            );
            return;
        }

        const signedUrl = await this.services
            .getPersistentDownloadFileService()
            .getSignedUrl(fileId, req.user.organizationUuid);

        this.setStatus(302);
        this.setHeader('Location', signedUrl);
    }
}
