import { ApiErrorPayload, NotFoundError } from '@lightdash/common';
import { Get, OperationId, Path, Response, Route, Tags } from '@tsoa/runtime';
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
    async getFile(@Path() fileId: string): Promise<void> {
        if (!NANOID_REGEX.test(fileId)) {
            throw new NotFoundError('Cannot find file');
        }

        const signedUrl = await this.services
            .getPersistentDownloadFileService()
            .getSignedUrl(fileId);

        this.setStatus(302);
        this.setHeader('Location', signedUrl);
    }
}
