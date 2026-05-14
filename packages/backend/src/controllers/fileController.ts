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
import path from 'path';
import { pipeline } from 'stream/promises';
import { createContentDispositionHeader } from '../utils/FileDownloadUtils/FileDownloadUtils';
import { BaseController } from './baseController';

const NANOID_REGEX = /^[\w-]{21}$/;

// Maps the stored `file_type` (values originate from DownloadFileType, but
// callers also pass raw strings like 'pdf', 'zip', 'gsheets') to a response
// Content-Type. Unknown types fall back to application/octet-stream.
const FILE_TYPE_TO_MIME: Record<string, string> = {
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jsonl: 'application/jsonl',
    s3_jsonl: 'application/jsonl',
    image: 'image/png',
    pdf: 'application/pdf',
    zip: 'application/zip',
};

@Route('/api/v1/file')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Files')
export class FileController extends BaseController {
    /**
     * Get a persistent file download. Streams the file body through the
     * backend so self-hosted deployments don't need to expose their internal
     * S3-compatible storage endpoint to browsers.
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

        const { stream, fileType, s3Key } = await this.services
            .getPersistentDownloadFileService()
            .getFileStream(fileId, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });

        const res = req.res!;
        const contentType =
            FILE_TYPE_TO_MIME[fileType] ?? 'application/octet-stream';
        const filename = path.basename(s3Key);

        res.setHeader('Content-Type', contentType);
        // Use RFC 5987 encoding so non-ASCII characters in the filename
        // (em-dashes, accented letters, emojis from dashboard names) don't
        // make Node throw `ERR_INVALID_CHAR` on setHeader, which would turn
        // the download into a ~200-byte JSON error response (PROD-7227).
        res.setHeader(
            'Content-Disposition',
            createContentDispositionHeader(filename),
        );
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');

        try {
            await pipeline(stream, res);
        } catch (error) {
            // If we've already started writing the response body there's
            // nothing useful we can send back to the client — just make sure
            // the socket is torn down. Otherwise let TSOA turn the error into
            // a JSON error response.
            if (res.headersSent) {
                res.destroy(error as Error);
                return;
            }
            throw error;
        }
    }
}
