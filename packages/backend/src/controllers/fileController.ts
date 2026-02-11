import { ApiErrorPayload } from '@lightdash/common';
import { Get, OperationId, Path, Response, Route, Tags } from '@tsoa/runtime';
import { BaseController } from './baseController';

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
        const signedUrl = await this.services
            .getPersistentDownloadFileService()
            .getSignedUrl(fileId);

        this.setStatus(302);
        this.setHeader('Location', signedUrl);
    }
}
