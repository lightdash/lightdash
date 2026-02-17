import {
    AnyType,
    ApiErrorPayload,
    DownloadFileType,
    NotFoundError,
} from '@lightdash/common';
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

const PROXY_CONTENT_TYPES: Record<string, string> = {
    [DownloadFileType.IMAGE]: 'image/png',
};

@Route('/api/v1/file')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Files')
export class FileController extends BaseController {
    /**
     * Get a persistent file download, proxied for images or redirect for other types
     * @summary Get file
     * @param fileId the persistent file nanoid
     */
    @Get('{fileId}')
    @OperationId('getFile')
    async getFile(
        @Path() fileId: string,
        @Request() req: express.Request,
    ): Promise<AnyType> {
        if (!NANOID_REGEX.test(fileId)) {
            throw new NotFoundError('Cannot find file');
        }

        const requestContext = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        };

        const service = this.services.getPersistentDownloadFileService();
        const fileType = await service.getFileType(fileId, requestContext);
        const contentType = PROXY_CONTENT_TYPES[fileType];

        if (contentType) {
            this.setStatus(200);
            this.setHeader('Content-Type', contentType);
            this.setHeader('Cache-Control', 'public, max-age=3600, immutable');
            this.setHeader('X-Robots-Tag', 'noindex, nofollow');

            const { stream } = await service.getFileStream(
                fileId,
                requestContext,
            );
            const { res } = req;
            if (res) {
                stream.pipe(res);
                await new Promise<void>((resolve) => {
                    stream.on('end', () => {
                        res.end();
                        resolve();
                    });
                });
            }
            return;
        }

        const signedUrl = await service.getSignedUrl(fileId, requestContext);
        this.setStatus(302);
        this.setHeader('Location', signedUrl);
        this.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
}
