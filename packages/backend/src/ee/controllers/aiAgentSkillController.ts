import {
    ApiAiAgentSkillResponse,
    ApiAiAgentSkillSummaryListResponse,
    ApiAiAgentSkillValidationResponse,
    ApiAiAgentSkillVersionListResponse,
    ApiAiAgentSkillVersionResponse,
    ApiCreateAiAgentSkill,
    ApiErrorPayload,
    ApiSuccess,
    ApiUpdateAiAgentSkill,
    ApiValidateAiAgentSkill,
    assertRegisteredAccount,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
import { type AiAgentSkillService } from '../services/AiAgentSkillService';

@Route('/api/v1/aiAgents/skills')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentSkillController extends BaseController {
    private getService(): AiAgentSkillService {
        return this.services.getAiAgentSkillService<AiAgentSkillService>();
    }

    /**
     * List the organization's custom skills. With a project, returns the
     * organization-wide skills plus the ones scoped to that project.
     * @summary List AI agent skills
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAiAgentSkills')
    async listSkills(
        @Request() req: express.Request,
        @Query() projectUuid?: string,
    ): Promise<ApiAiAgentSkillSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listSkills(
                toSessionUser(req.account),
                { projectUuid: projectUuid ?? null },
            ),
        };
    }

    /**
     * Validate a skill folder without saving it. Returns the same errors and
     * warnings the editor and the CLI show.
     * @summary Validate an AI agent skill
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/validate')
    @OperationId('validateAiAgentSkill')
    async validateSkill(
        @Request() req: express.Request,
        @Body() body: ApiValidateAiAgentSkill,
    ): Promise<ApiAiAgentSkillValidationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().validate(
                toSessionUser(req.account),
                body.files,
            ),
        };
    }

    /**
     * Create a custom skill from its files and publish version 1.
     * @summary Create an AI agent skill
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAiAgentSkill')
    async createSkill(
        @Request() req: express.Request,
        @Body() body: ApiCreateAiAgentSkill,
    ): Promise<ApiAiAgentSkillResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().createSkill(
                toSessionUser(req.account),
                {
                    files: body.files,
                    projectUuid: body.projectUuid ?? null,
                    agentUuids: body.agentUuids ?? [],
                    source: 'ui',
                },
            ),
        };
    }

    /**
     * @summary Get an AI agent skill
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{skillUuid}')
    @OperationId('getAiAgentSkill')
    async getSkill(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
    ): Promise<ApiAiAgentSkillResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getSkill(
                toSessionUser(req.account),
                skillUuid,
            ),
        };
    }

    /**
     * Save the skill's files. Publishes a new version when the content changed.
     * @summary Update an AI agent skill
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{skillUuid}')
    @OperationId('updateAiAgentSkill')
    async updateSkill(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
        @Body() body: ApiUpdateAiAgentSkill,
    ): Promise<ApiAiAgentSkillResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const { skill } = await this.getService().updateSkill(
            toSessionUser(req.account),
            skillUuid,
            { files: body.files, source: 'ui' },
        );
        return { status: 'ok', results: skill };
    }

    /**
     * Soft-delete the skill and unbind it from every agent. Returns the
     * agents that lost it.
     * @summary Delete an AI agent skill
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{skillUuid}')
    @OperationId('deleteAiAgentSkill')
    async deleteSkill(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
    ): Promise<ApiSuccess<{ unboundAgentUuids: string[] }>> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const unboundAgentUuids = await this.getService().deleteSkill(
            toSessionUser(req.account),
            skillUuid,
        );
        return { status: 'ok', results: { unboundAgentUuids } };
    }

    /**
     * @summary List an AI agent skill's versions
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{skillUuid}/versions')
    @OperationId('listAiAgentSkillVersions')
    async listVersions(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
    ): Promise<ApiAiAgentSkillVersionListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listVersions(
                toSessionUser(req.account),
                skillUuid,
            ),
        };
    }

    /**
     * @summary Get one version of an AI agent skill
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{skillUuid}/versions/{versionNumber}')
    @OperationId('getAiAgentSkillVersion')
    async getVersion(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
        @Path() versionNumber: number,
    ): Promise<ApiAiAgentSkillVersionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getVersion(
                toSessionUser(req.account),
                skillUuid,
                versionNumber,
            ),
        };
    }

    /**
     * Publish a new version whose content equals the chosen one. Also
     * restores a soft-deleted skill.
     * @summary Restore a version of an AI agent skill
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{skillUuid}/versions/{versionNumber}/restore')
    @OperationId('restoreAiAgentSkillVersion')
    async restoreVersion(
        @Request() req: express.Request,
        @Path() skillUuid: UUID,
        @Path() versionNumber: number,
    ): Promise<ApiAiAgentSkillResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().restoreVersion(
                toSessionUser(req.account),
                skillUuid,
                versionNumber,
            ),
        };
    }
}
