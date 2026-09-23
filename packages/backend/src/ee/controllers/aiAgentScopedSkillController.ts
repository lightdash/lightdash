import {
    ApiAgentSkillsListingResponse,
    ApiErrorPayload,
    ApiSetAgentSkills,
    assertRegisteredAccount,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
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
import { type AiAgentSkillService } from '../services/AiAgentSkillService';

@Route('/api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/skills')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentScopedSkillController extends BaseController {
    private getService(): AiAgentSkillService {
        return this.services.getAiAgentSkillService<AiAgentSkillService>();
    }

    /**
     * The skills this agent serves: its bound custom skills plus the built-in
     * ones. Anyone who can use the agent can read this.
     * @summary List agent skills
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAgentSkills')
    async listAgentSkills(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
    ): Promise<ApiAgentSkillsListingResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listAgentSkills(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
            ),
        };
    }

    /**
     * Replace the set of custom skills bound to this agent.
     * @summary Set agent skills
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('setAgentSkills')
    async setAgentSkills(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Body() body: ApiSetAgentSkills,
    ): Promise<ApiAgentSkillsListingResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().setAgentSkills(
                toSessionUser(req.account),
                { projectUuid, agentUuid, skillUuids: body.skillUuids },
            ),
        };
    }
}
