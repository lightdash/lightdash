import {
    type ApiErrorPayload,
    type ApiSshKeyPairResponse,
} from '@lightdash/common';
import {
    Middlewares,
    OperationId,
    Post,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/ssh')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SSH Keypairs')
export class SshController extends BaseController {
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('201', 'Success')
    @Post('key-pairs')
    @OperationId('createSshKeyPair')
    async createSshKeyPair(): Promise<ApiSshKeyPairResponse> {
        const results = await this.services.getSshKeyPairService().create();
        this.setStatus(201);
        return {
            status: 'ok',
            results,
        };
    }
}
