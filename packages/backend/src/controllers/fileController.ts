import {
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

@Route('/api/v1/file')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Files')
export class FileController extends BaseController {
    /**
     * Get a persistent file download via redirect or inline
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

        const service = this.services.getPersistentDownloadFileService();
        const file = await service.getFile(fileId);
        const requestContext = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            requestedByUserUuid: req.user?.userUuid,
        };

        if (service.inlineImages && file.fileType === DownloadFileType.IMAGE) {
            const { stream } = await service.getFileStream(
                file,
                requestContext,
            );

            // Set headers directly on Express response before piping.
            // TSOA's this.setHeader() stores headers on the controller and
            // applies them in returnHandler(), but returnHandler() runs AFTER
            // the stream has been piped — by then headersSent is true and
            // TSOA bails out, so the headers never reach the response.
            const { res } = req;
            if (res) {
                res.status(200);
                res.setHeader('Content-Type', 'image/png');
                res.setHeader(
                    'Cache-Control',
                    'public, max-age=31536000, immutable',
                );
                res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                stream.pipe(res);
                await new Promise<void>((resolve) => {
                    stream.on('end', () => {
                        res.end();
                        resolve();
                    });
                });
            }
        } else {
            const signedUrl = await service.getSignedUrl(file, requestContext);

            this.setStatus(302);
            this.setHeader('Location', signedUrl);
            this.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
    }
}
