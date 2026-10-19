import {
    assertRegisteredAccount,
    type ApiAiProviderCredentialCreatedResponse,
    type ApiAiProviderCredentialsResponse,
    type ApiErrorPayload,
    type ApiProjectAiCredentialResponse,
    type ApiSuccessEmpty,
    type CreateAiProviderCredential,
    type ProjectAiCredentialSelection,
    type UpdateAiProviderCredential,
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
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiOrganizationSettingsService } from '../services/AiOrganizationSettingsService';

@Route('/api/v1')
@Response<ApiErrorPayload>('default', 'Error')
export class AiProviderCredentialController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.listCredentials',
        ),
    ])
    @SuccessResponse('200', 'Retrieved AI provider credentials')
    @Get('/ai/provider-credentials')
    @OperationId('listAiProviderCredentials')
    async listCredentials(
        @Request() req: express.Request,
    ): Promise<ApiAiProviderCredentialsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.getService().listProviderCredentials(
            toSessionUser(req.account),
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.createCredential',
        ),
    ])
    @SuccessResponse('201', 'Created AI provider credential')
    @Post('/ai/provider-credentials')
    @OperationId('createAiProviderCredential')
    async createCredential(
        @Request() req: express.Request,
        @Body() body: CreateAiProviderCredential,
    ): Promise<ApiAiProviderCredentialCreatedResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.getService().createProviderCredential(
            toSessionUser(req.account),
            body,
        );
        this.setStatus(201);
        return { status: 'ok', results };
    }

    /**
     * @summary Convert a legacy Bedrock configuration into a managed credential
     *
     * Lets an organization that configured Bedrock before named credentials
     * existed take ownership of that configuration so it can be edited or
     * removed, without having to add a second credential first.
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.adoptLegacyCredential',
        ),
    ])
    @SuccessResponse('200', 'Converted the legacy Bedrock configuration')
    @Post('/ai/provider-credentials/adopt-legacy')
    @OperationId('adoptLegacyAiProviderCredential')
    async adoptLegacyCredential(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().adoptLegacyProviderCredential(
            toSessionUser(req.account),
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.updateCredential',
        ),
    ])
    @SuccessResponse('200', 'Updated AI provider credential')
    @Patch('/ai/provider-credentials/{credentialUuid}')
    @OperationId('updateAiProviderCredential')
    async updateCredential(
        @Request() req: express.Request,
        @Path() credentialUuid: UUID,
        @Body() body: UpdateAiProviderCredential,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().updateProviderCredential(
            toSessionUser(req.account),
            credentialUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * @summary Replace an AI provider credential
     *
     * Full replacement. Unlike PATCH this never reads the stored ciphertext, so
     * it is how an administrator repairs a credential that can no longer be
     * decrypted. Every field is required.
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.replaceCredential',
        ),
    ])
    @SuccessResponse('200', 'Replaced AI provider credential')
    @Put('/ai/provider-credentials/{credentialUuid}')
    @OperationId('replaceAiProviderCredential')
    async replaceCredential(
        @Request() req: express.Request,
        @Path() credentialUuid: UUID,
        @Body() body: CreateAiProviderCredential,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().replaceProviderCredential(
            toSessionUser(req.account),
            credentialUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.deleteCredential',
        ),
    ])
    @SuccessResponse('200', 'Deleted AI provider credential')
    @Delete('/ai/provider-credentials/{credentialUuid}')
    @OperationId('deleteAiProviderCredential')
    async deleteCredential(
        @Request() req: express.Request,
        @Path() credentialUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteProviderCredential(
            toSessionUser(req.account),
            credentialUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.setDefaultCredential',
        ),
    ])
    @SuccessResponse('200', 'Set default AI provider credential')
    @Put('/ai/provider-credentials/{credentialUuid}/default')
    @OperationId('setDefaultAiProviderCredential')
    async setDefaultCredential(
        @Request() req: express.Request,
        @Path() credentialUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().setDefaultProviderCredential(
            toSessionUser(req.account),
            credentialUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.getProjectCredential',
        ),
    ])
    @SuccessResponse('200', 'Retrieved project AI provider credential')
    @Get('/projects/{projectUuid}/ai/provider-credential')
    @OperationId('getProjectAiProviderCredential')
    async getProjectCredential(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiProjectAiCredentialResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.getService().getProjectProviderCredential(
            toSessionUser(req.account),
            projectUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiProviderCredentialController.setProjectCredential',
        ),
    ])
    @SuccessResponse('200', 'Updated project AI provider credential')
    @Put('/projects/{projectUuid}/ai/provider-credential')
    @OperationId('setProjectAiProviderCredential')
    async setProjectCredential(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: ProjectAiCredentialSelection,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().setProjectProviderCredential(
            toSessionUser(req.account),
            projectUuid,
            body.credentialUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    protected getService() {
        return this.services.getAiOrganizationSettingsService<AiOrganizationSettingsService>();
    }
}
