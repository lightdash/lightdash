import { ApiErrorPayload } from '@lightdash/common';
import {
    Get,
    OperationId,
    Path,
    Produces,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import { Readable } from 'stream';
import { BaseController } from './baseController';

@Route('/api/v1/prompts')
@Produces('text/markdown')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Prompts')
export class PromptController extends BaseController {
    /**
     * Get public instructions for a named prompt
     * @summary Get prompt
     */
    @SuccessResponse('200', 'Success')
    @Get('/{name}')
    @OperationId('GetPrompt')
    async getPrompt(@Path() name: string): Promise<Readable> {
        const prompt = await this.services.getPromptService().getPrompt(name);
        this.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        return Readable.from(prompt);
    }
}
