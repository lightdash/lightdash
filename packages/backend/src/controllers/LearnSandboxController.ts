import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiLearnCommandCreatedResponse,
    type ApiLearnCommandOutputResponse,
    type ApiLearnWorkspaceFileResponse,
    type ApiLearnWorkspaceFilesResponse,
    type ApiSuccessEmpty,
    type LearnSandboxCommandRequest,
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
    Tags,
} from '@tsoa/runtime';
import type express from 'express';
import { toSessionUser } from '../auth/account';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/learn/workspace')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Learn')
export class LearnSandboxController extends BaseController {
    /**
     * List the files in the learner's sandbox workspace
     * @summary List workspace files
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/files')
    @OperationId('ListLearnWorkspaceFiles')
    async listFiles(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiLearnWorkspaceFilesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnSandboxService()
                .listFiles(toSessionUser(req.account), projectUuid),
        };
    }

    /**
     * Get the content of a single file in the learner's sandbox workspace.
     * The path is URL-encoded (e.g. `models%2Forders.yml`); tsoa/Express
     * decode it (including any encoded slashes) before it reaches this
     * handler, so `path` already holds the plain file path.
     * @summary Get workspace file
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/files/{path}')
    @OperationId('GetLearnWorkspaceFile')
    async getFile(
        @Path() projectUuid: string,
        @Path() path: string,
        @Request() req: express.Request,
    ): Promise<ApiLearnWorkspaceFileResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnSandboxService()
                .getFile(toSessionUser(req.account), projectUuid, path),
        };
    }

    /**
     * Save the content of a single file in the learner's sandbox workspace.
     * The path is URL-encoded (e.g. `models%2Forders.yml`); tsoa/Express
     * decode it (including any encoded slashes) before it reaches this
     * handler, so `path` already holds the plain file path.
     * @summary Save workspace file
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Put('/files/{path}')
    @OperationId('SaveLearnWorkspaceFile')
    async saveFile(
        @Path() projectUuid: string,
        @Path() path: string,
        @Body() body: { content: string },
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getLearnSandboxService()
            .saveFile(
                toSessionUser(req.account),
                projectUuid,
                path,
                body.content,
            );
        return { status: 'ok', results: undefined };
    }

    /**
     * Queue a lightdash or dbt command to run in the learner's sandbox
     * workspace
     * @summary Run workspace command
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Post('/commands')
    @OperationId('RunLearnWorkspaceCommand')
    async runCommand(
        @Path() projectUuid: string,
        @Body() body: LearnSandboxCommandRequest,
        @Request() req: express.Request,
    ): Promise<ApiLearnCommandCreatedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnSandboxService()
                .enqueueCommand(toSessionUser(req.account), projectUuid, body),
        };
    }

    /**
     * Get the status and output of a previously queued sandbox command.
     * Pass `after` (the highest `seq` already received) to page through
     * output as it streams in.
     * @summary Get workspace command output
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/commands/{commandUuid}')
    @OperationId('GetLearnWorkspaceCommandOutput')
    async getCommandOutput(
        @Path() projectUuid: string,
        @Path() commandUuid: string,
        @Request() req: express.Request,
        @Query() after?: number,
    ): Promise<ApiLearnCommandOutputResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnSandboxService()
                .getOutput(
                    toSessionUser(req.account),
                    projectUuid,
                    commandUuid,
                    after ?? 0,
                ),
        };
    }
}
