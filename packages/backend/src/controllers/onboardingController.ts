import {
    ApiErrorPayload,
    ApiOnboardingProjectStateResponse,
    assertRegisteredAccount,
    UpdateOnboardingProjectStep,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/onboarding/state')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class OnboardingController extends BaseController {
    /**
     * Get the onboarding progress stored for a project.
     * @summary Get onboarding state
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('GetOnboardingProjectState')
    async getState(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingProjectStateResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingFlowService()
                .getState(req.account, projectUuid),
        };
    }

    /**
     * Update one onboarding step and return the current project state.
     * @summary Update onboarding state
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/')
    @OperationId('UpdateOnboardingProjectState')
    async updateState(
        @Path() projectUuid: UUID,
        @Body() body: UpdateOnboardingProjectStep,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingProjectStateResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingFlowService()
                .updateStep(
                    req.account,
                    projectUuid,
                    body.step,
                    body.status,
                    body.result,
                ),
        };
    }
}
