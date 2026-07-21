import {
    assertRegisteredAccount,
    type ApiAgentOnboardingFileResponse,
    type ApiAgentOnboardingRunResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Get,
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
import { OnboardingAgentService } from '../services/OnboardingAgentService/OnboardingAgentService';

@Route('/api/v1/ee/projects/{projectUuid}/agent-onboarding')
@Response<ApiErrorPayload>('default', 'Error')
export class OnboardingAgentController extends BaseController {
    /**
     * Start a server-side agent onboarding run for a prepared project.
     * Returns the existing run when one is already active for the project.
     * @summary Start agent onboarding run
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('202', 'Accepted')
    @Post('/')
    @OperationId('createAgentOnboardingRun')
    async createRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiAgentOnboardingRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(202);
        return {
            status: 'ok',
            results: await this.getOnboardingAgentService().createRun({
                user: toSessionUser(req.account),
                projectUuid,
            }),
        };
    }

    /**
     * Get the durable state and progress events of an agent onboarding run.
     * @summary Get agent onboarding run
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentOnboardingRunUuid}')
    @OperationId('getAgentOnboardingRun')
    async getRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentOnboardingRunUuid: UUID,
    ): Promise<ApiAgentOnboardingRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getOnboardingAgentService().getRun(
                toSessionUser(req.account),
                projectUuid,
                agentOnboardingRunUuid,
            ),
        };
    }

    /**
     * Read the latest persisted contents of a generated onboarding file.
     * @summary Get onboarding run file
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{agentOnboardingRunUuid}/file')
    @OperationId('getAgentOnboardingFile')
    async getFile(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentOnboardingRunUuid: UUID,
        @Query() path: string,
    ): Promise<ApiAgentOnboardingFileResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getOnboardingAgentService().getFile(
                toSessionUser(req.account),
                projectUuid,
                agentOnboardingRunUuid,
                path,
            ),
        };
    }

    /**
     * Request cancellation of an agent onboarding run.
     * @summary Cancel agent onboarding run
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{agentOnboardingRunUuid}/cancel')
    @OperationId('cancelAgentOnboardingRun')
    async cancelRun(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentOnboardingRunUuid: UUID,
    ): Promise<ApiAgentOnboardingRunResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getOnboardingAgentService().cancelRun(
                toSessionUser(req.account),
                projectUuid,
                agentOnboardingRunUuid,
            ),
        };
    }

    protected getOnboardingAgentService() {
        return this.services.getOnboardingAgentService<OnboardingAgentService>();
    }
}
