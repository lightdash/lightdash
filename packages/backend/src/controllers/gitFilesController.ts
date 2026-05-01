import {
    ApiErrorPayload,
    ApiGitBranchCreatedResponse,
    ApiGitBranchesResponse,
    ApiGitFileDeletedResponse,
    ApiGitFileOrDirectoryResponse,
    ApiGitFileSavedResponse,
    ApiGitPullRequestCreatedResponse,
    assertRegisteredAccount,
    CreateGitBranchRequest,
    CreateGitPullRequestRequest,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
import express from 'express';
import { toSessionUser } from '../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/git')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Git Files')
export class GitFilesController extends BaseController {
    /**
     * List branches for the connected repository
     * @summary List branches
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/branches')
    @OperationId('listGitBranches')
    async listBranches(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGitBranchesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .listBranchesForProject(
                    toSessionUser(req.account),
                    projectUuid,
                ),
        };
    }

    /**
     * Get file content or directory listing. Returns directory entries if path is a directory, file content if path is a file.
     * @summary Get file or directory
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/branches/{branch}/files')
    @OperationId('getGitFileOrDirectory')
    async getFileOrDirectory(
        @Path() projectUuid: string,
        @Path() branch: string,
        @Query() path?: string,
        @Request() req?: express.Request,
    ): Promise<ApiGitFileOrDirectoryResponse> {
        assertRegisteredAccount(req!.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .getFileOrDirectory(
                    toSessionUser(req!.account),
                    projectUuid,
                    branch,
                    path,
                ),
        };
    }

    /**
     * Create or update a file. Provide sha to update existing file, omit for new file.
     * @summary Save file
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/branches/{branch}/files')
    @OperationId('saveGitFile')
    async saveFile(
        @Path() projectUuid: string,
        @Path() branch: string,
        @Body()
        body: {
            path: string;
            content: string;
            sha?: string;
            message?: string;
        },
        @Request() req: express.Request,
    ): Promise<ApiGitFileSavedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .saveFile(
                    toSessionUser(req.account),
                    projectUuid,
                    branch,
                    body.path,
                    body.content,
                    body.sha,
                    body.message,
                ),
        };
    }

    /**
     * Delete a file from the repository
     * @summary Delete file
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/branches/{branch}/files')
    @OperationId('deleteGitFile')
    async deleteFile(
        @Path() projectUuid: string,
        @Path() branch: string,
        @Body()
        body: {
            path: string;
            sha: string;
            message?: string;
        },
        @Request() req: express.Request,
    ): Promise<ApiGitFileDeletedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getGitIntegrationService()
            .deleteFileFromRepo(
                toSessionUser(req.account),
                projectUuid,
                branch,
                body.path,
                body.sha,
                body.message,
            );
        return {
            status: 'ok',
            results: { deleted: true },
        };
    }

    /**
     * Create a new branch from a source branch
     * @summary Create branch
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/branches')
    @OperationId('createGitBranch')
    async createBranch(
        @Path() projectUuid: string,
        @Body() body: CreateGitBranchRequest,
        @Request() req: express.Request,
    ): Promise<ApiGitBranchCreatedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createBranchFromSource(
                    toSessionUser(req.account),
                    projectUuid,
                    body.name,
                    body.sourceBranch,
                ),
        };
    }

    /**
     * Create a pull request from a branch to the default branch
     * @summary Create pull request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/branches/{branch}/pull-request')
    @OperationId('createGitPullRequest')
    async createPullRequest(
        @Path() projectUuid: string,
        @Path() branch: string,
        @Body() body: CreateGitPullRequestRequest,
        @Request() req: express.Request,
    ): Promise<ApiGitPullRequestCreatedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequestFromBranch(
                    toSessionUser(req.account),
                    projectUuid,
                    branch,
                    body.title,
                    body.description,
                ),
        };
    }
}
