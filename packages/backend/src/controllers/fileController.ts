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
        const fileType = await service.getFileType(fileId);

        if (fileType === DownloadFileType.IMAGE) {
            const { stream } = await service.getFileStream(fileId, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                requestedByUserUuid: req.user?.userUuid,
            });

            this.setStatus(200);
            this.setHeader('Content-Type', 'image/png');
            this.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
            );
            this.setHeader('X-Robots-Tag', 'noindex, nofollow');

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
        } else {
            const signedUrl = await service.getSignedUrl(fileId, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                requestedByUserUuid: req.user?.userUuid,
            });

            this.setStatus(302);
            this.setHeader('Location', signedUrl);
            this.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
    }
}
