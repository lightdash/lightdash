import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    ParameterError,
    type ApiAiThreadFileResponse,
    type UUID,
} from '@lightdash/common';
import {
    Delete,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiThreadFileService } from '../services/AiThreadFileService';

@Route('/api/v1/aiAgents/thread-files')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiThreadFileController extends BaseController {
    private getService(): AiThreadFileService {
        return this.services.getAiThreadFileService<AiThreadFileService>();
    }

    /**
     * Upload a text document to attach to an agent conversation. Send the raw
     * bytes as the body with a Content-Length header and pass the file name as
     * a query parameter. The file is unattached until it is sent with a
     * prompt as a `thread_file` context item.
     * @summary Upload a conversation document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('uploadAiThreadFile')
    async upload(
        @Request() req: express.Request,
        @Query() filename: string,
    ): Promise<ApiAiThreadFileResponse> {
        assertRegisteredAccount(req.account);
        const contentLength = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().upload(
                toSessionUser(req.account),
                { fileName: filename, contentLength, body: req },
            ),
        };
    }

    /**
     * Delete a document that has not been sent yet.
     * @summary Delete an unsent conversation document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{fileUuid}')
    @OperationId('deleteAiThreadFile')
    async delete(
        @Request() req: express.Request,
        @Path() fileUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().delete(toSessionUser(req.account), fileUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
