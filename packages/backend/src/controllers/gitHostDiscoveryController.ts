import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiGitHostBranchesResponse,
    type ApiGitHostRepositoriesResponse,
    type ApiSemanticLayerFormatResponse,
    type GitHostCredentials,
    type GitHostRepository,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

type RepositoryRefBody = Pick<
    GitHostRepository,
    'id' | 'fullName' | 'azureProject'
>;

@Route('/api/v1/org/git-hosts')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class GitHostDiscoveryController extends BaseController {
    /**
     * List the repositories that the given git host credentials can read.
     * Credentials are used for this request only and are not stored.
     * @summary List git host repositories
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/repositories')
    @OperationId('listGitHostRepositories')
    async listRepositories(
        @Request() req: express.Request,
        @Body() body: { credentials: GitHostCredentials },
    ): Promise<ApiGitHostRepositoriesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitHostDiscoveryService()
                .listRepositories(req.account, body.credentials),
        };
    }

    /**
     * List the branches of a repository on a git host.
     * @summary List git host branches
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/branches')
    @OperationId('listGitHostBranches')
    async listBranches(
        @Request() req: express.Request,
        @Body()
        body: {
            credentials: GitHostCredentials;
            repository: RepositoryRefBody;
        },
    ): Promise<ApiGitHostBranchesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitHostDiscoveryService()
                .listBranches(req.account, body.credentials, body.repository),
        };
    }

    /**
     * Detect whether a repository path holds a dbt project, Lightdash YAML,
     * both or neither.
     * @summary Detect the semantic layer format of a repository
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/format')
    @OperationId('detectGitHostSemanticLayerFormat')
    async detectFormat(
        @Request() req: express.Request,
        @Body()
        body: {
            credentials: GitHostCredentials;
            repository: RepositoryRefBody;
            branch: string;
            subPath: string;
        },
    ): Promise<ApiSemanticLayerFormatResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitHostDiscoveryService()
                .detectFormat(req.account, body),
        };
    }
}
