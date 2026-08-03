import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiOrganizationHomepageSettingsResponse,
    type UpdateOrganizationHomepageSettings,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type ProjectHomepageService } from '../services/ProjectHomepageService';

@Route('/api/v1/org/homepage-settings')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Homepage')
export class OrganizationHomepageSettingsController extends BaseController {
    private getHomepageService(): ProjectHomepageService {
        return this.services.getProjectHomepageService<ProjectHomepageService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getOrganizationHomepageSettings')
    async getSettings(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationHomepageSettingsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getOrgHomepageSettings(
                toSessionUser(req.account),
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/')
    @OperationId('updateOrganizationHomepageSettings')
    async updateSettings(
        @Request() req: express.Request,
        @Body() body: UpdateOrganizationHomepageSettings,
    ): Promise<ApiOrganizationHomepageSettingsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().updateOrgHomepageSettings(
                toSessionUser(req.account),
                body,
            ),
        };
    }
}
