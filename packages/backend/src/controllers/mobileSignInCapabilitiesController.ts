import type { MobileSignInCapabilities } from '@lightdash/common';
import { Get, OperationId, Route, SuccessResponse, Tags } from '@tsoa/runtime';
import { BaseController } from './baseController';

@Route('/api/v1/mobile/sign-in-capabilities')
@Tags('Mobile')
export class MobileSignInCapabilitiesController extends BaseController {
    @Get('/')
    @OperationId('GetMobileSignInCapabilities')
    @SuccessResponse('200', 'Success')
    async getCapabilities(): Promise<MobileSignInCapabilities> {
        this.setHeader('Cache-Control', 'no-store');
        return this.services.getMobileSignInService().getCapabilities();
    }
}
