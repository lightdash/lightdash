import {
    assertRegisteredAccount,
    type AiRouterDecisionCommitRequest,
    type AiRouterDecisionConfidence,
    type AiRouterRouteRequest,
    type AiRouterSelectionMode,
    type ApiAiRouterDecisionCommitResponse,
    type ApiAiRouterDecisionListResponse,
    type ApiAiRouterInstructionResponse,
    type ApiAiRouterResponse,
    type ApiAiRouterRouteResponse,
    type ApiErrorPayload,
    type UpsertAiRouterInstructionRequest,
    type UpsertAiRouterRequest,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiRouterService } from '../services/AiRouterService/AiRouterService';

@Route('/api/v1/org/aiRouter')
@Response<ApiErrorPayload>('default', 'Error')
export class AiRouterController extends BaseController {
    /**
     * Get the AI router configuration for the organization. Returns 404 when the
     * router has not been configured yet — clients use this to detect first-use.
     * @summary Get AI router config
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getAiRouterConfig')
    async getConfig(
        @Request() req: express.Request,
    ): Promise<ApiAiRouterResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().getConfig(req.account),
        };
    }

    /**
     * Upsert the AI router configuration. Creates the row lazily on first save.
     * @summary Upsert AI router config
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('upsertAiRouterConfig')
    async upsertConfig(
        @Request() req: express.Request,
        @Body() body: UpsertAiRouterRequest,
    ): Promise<ApiAiRouterResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().upsertConfig(req.account, body),
        };
    }

    /**
     * Get the active routing instruction for a project. Returns null when no
     * instruction has been written for the project yet.
     * @summary Get AI router instruction
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/instructions/{projectUuid}')
    @OperationId('getAiRouterInstruction')
    async getInstruction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiRouterInstructionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().getInstruction(
                req.account,
                projectUuid,
            ),
        };
    }

    /**
     * Write a new routing-instruction version for a project. Versions are
     * append-only; the latest one is the active instruction.
     * @summary Upsert AI router instruction
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/instructions/{projectUuid}')
    @OperationId('upsertAiRouterInstruction')
    async upsertInstruction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpsertAiRouterInstructionRequest,
    ): Promise<ApiAiRouterInstructionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().upsertInstruction(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Route a user prompt to the best candidate agent in the current project.
     * @summary Route prompt
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/route')
    @OperationId('routeAiAgent')
    async route(
        @Request() req: express.Request,
        @Body() body: AiRouterRouteRequest,
    ): Promise<ApiAiRouterRouteResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().route(req.account, body),
        };
    }

    /**
     * Commit a router decision once the user has resolved it (router
     * auto-routed and the thread is created, or the user picked an agent
     * from the picker). Decisions left uncommitted indicate the user
     * abandoned the flow.
     * @summary Commit router decision
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/decisions/{decisionUuid}/commit')
    @OperationId('commitAiRouterDecision')
    async commit(
        @Request() req: express.Request,
        @Path() decisionUuid: string,
        @Body() body: AiRouterDecisionCommitRequest,
    ): Promise<ApiAiRouterDecisionCommitResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.routerService().commitDecision(
            req.account,
            decisionUuid,
            body,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * List recent routing decisions for the org's router.
     * @summary List router decisions
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/decisions')
    @OperationId('listAiRouterDecisions')
    async listDecisions(
        @Request() req: express.Request,
        @Query() confidence?: AiRouterDecisionConfidence,
        @Query() selectionMode?: AiRouterSelectionMode,
        @Query() fromDate?: string,
        @Query() toDate?: string,
    ): Promise<ApiAiRouterDecisionListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.routerService().listDecisions(req.account, {
                confidence,
                selectionMode,
                fromDate,
                toDate,
            }),
        };
    }

    private routerService(): AiRouterService {
        return this.services.getAiRouterService<AiRouterService>();
    }
}
