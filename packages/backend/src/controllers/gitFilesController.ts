import {
    ApiErrorPayload,
    ApiGitBranchesResponse,
    ApiGitFileDeletedResponse,
    ApiGitFileOrDirectoryResponse,
    ApiGitFileSavedResponse,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .listBranchesForProject(req.user!, projectUuid),
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .getFileOrDirectory(req!.user!, projectUuid, branch, path),
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .saveFile(
                    req.user!,
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
        this.setStatus(200);
        await this.services
            .getGitIntegrationService()
            .deleteFileFromRepo(
                req.user!,
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
}
