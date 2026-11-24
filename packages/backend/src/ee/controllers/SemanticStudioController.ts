import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSemanticLayerDraftApplyResponse,
    type ApiSemanticLayerDraftedModelsResponse,
    type ApiSemanticLayerDraftImpactResponse,
    type ApiSemanticLayerDraftKeepRequest,
    type ApiSemanticLayerDraftModelSaveResponse,
    type ApiSemanticLayerDraftMoveRequest,
    type ApiSemanticLayerDraftResponse,
    type ApiSemanticLayerDraftStateResponse,
    type ApiSemanticLayerDraftTakeLiveRequest,
    type ApiSemanticLayerDraftUsageResponse,
    type ApiSemanticLayerModelResponse,
    type ApiSemanticLayerStatusResponse,
    type ApiSemanticLayerStoredModelsResponse,
    type ApiSemanticLayerUndoResponse,
    type ApiSemanticStudioBranchCompileFollowUpResponse,
    type ApiSemanticStudioCheckoutResponse,
    type ApiSemanticStudioSourceFileResponse,
    type ApiSemanticStudioSourceSaveResponse,
    type ApiSemanticStudioSourcesResponse,
    type ApiSemanticStudioWorkspaceResponse,
    type ApiSemanticStudioWorkspacesResponse,
    type ApiSuccessEmpty,
    type ApiWritebackMergeResponse,
    type SaveSemanticLayerDraftModelRequest,
    type SaveSemanticStudioSourceRequest,
    type SemanticLayerFieldUsageBody,
    type SemanticLayerUndoRequest,
    type SemanticStudioBranchCompileFollowUpBody,
    type SemanticStudioPublishBody,
    type SemanticStudioWorkspaceRenameBody,
    type SemanticStudioWorkspaceStartBody,
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
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type SemanticStudioCheckoutService } from '../services/SemanticStudioService/SemanticStudioCheckoutService';
import { type SemanticStudioService } from '../services/SemanticStudioService/SemanticStudioService';

@Route('/api/v1/projects/{projectUuid}/semantic-studio')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Semantic Studio')
export class SemanticStudioController extends BaseController {
    private getService(): SemanticStudioService {
        return this.services.getSemanticStudioService<SemanticStudioService>();
    }

    private getCheckoutService(): SemanticStudioCheckoutService {
        return this.services.getSemanticStudioCheckoutService<SemanticStudioCheckoutService>();
    }

    /**
     * Whether this person can change this project's models from the server.
     * @summary Get Semantic Studio status
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/status')
    @OperationId('getSemanticStudioStatus')
    async getBuilderStatus(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerStatusResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getPageStatus(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * The names of the models whose YAML the project keeps.
     * @summary List stored semantic layer models
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/models')
    @OperationId('getSemanticLayerStoredModels')
    async getStoredModels(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerStoredModelsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getStoredModels(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Studio work in this project: yours in flight, others' in flight, and yours finished lately.
     * @summary List Semantic Studio workspaces
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/workspaces')
    @OperationId('listSemanticStudioWorkspaces')
    async listWorkspaces(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticStudioWorkspacesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().listWorkspaces(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Makes a Studio conversation's workspace your active one, starting it when it has none.
     * @summary Start a Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/workspaces')
    @OperationId('startSemanticStudioWorkspace')
    async startWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SemanticStudioWorkspaceStartBody,
    ): Promise<ApiSemanticStudioWorkspaceResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().startWorkspace(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Leaves your active workspace, so your next conversation starts a new one.
     * @summary Leave my Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/workspaces/leave')
    @OperationId('leaveSemanticStudioWorkspace')
    async leaveWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().leaveWorkspace(
            toSessionUser(req.account),
            projectUuid,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * The change you have checked out, which the whole app shows you; null on what is published.
     * @summary Get my Semantic Studio checkout
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/checkout')
    @OperationId('getSemanticStudioCheckout')
    async getCheckout(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticStudioCheckoutResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().getCheckout(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Compiles the branch of your checked-out dbt change again.
     * @summary Compile my Semantic Studio checkout
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/checkout/compile')
    @OperationId('compileSemanticStudioCheckout')
    async compileCheckout(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticStudioCheckoutResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().compileCheckout(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Claims the hidden prompt that sends a failed compile of the agent's last save back to the agent; null when there is none to send.
     * @summary Claim a Semantic Studio compile follow-up
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/checkout/compile/follow-up')
    @OperationId('claimSemanticStudioCompileFollowUp')
    async claimCompileFollowUp(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SemanticStudioBranchCompileFollowUpBody,
    ): Promise<ApiSemanticStudioBranchCompileFollowUpResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().claimBranchCompileFollowUp(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Publishes your checked-out dbt draft: merges its pull request once its branch compiled.
     * @summary Publish my Semantic Studio checkout
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/checkout/publish')
    @OperationId('publishSemanticStudioCheckout')
    async publishCheckout(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SemanticStudioPublishBody,
    ): Promise<ApiWritebackMergeResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().publishCheckout(
                toSessionUser(req.account),
                projectUuid,
                body.prUrl,
            ),
        };
    }

    /**
     * The project's YAML and SQL files, at a change's open pull request or the branch it deploys from.
     * @summary List Semantic Studio source files
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/sources')
    @OperationId('listSemanticStudioSources')
    async listSources(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() prUrl?: string,
    ): Promise<ApiSemanticStudioSourcesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().listSources(
                toSessionUser(req.account),
                projectUuid,
                prUrl ?? null,
            ),
        };
    }

    /**
     * One source file's contents.
     * @summary Read a Semantic Studio source file
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/sources/file')
    @OperationId('readSemanticStudioSource')
    async readSource(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() path: string,
        @Query() prUrl?: string,
    ): Promise<ApiSemanticStudioSourceFileResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().readSource(
                toSessionUser(req.account),
                projectUuid,
                prUrl ?? null,
                path,
            ),
        };
    }

    /**
     * Saves an edit to one source file as a commit on a change's pull request, or opens one.
     * @summary Save a Semantic Studio source file
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/sources/file')
    @OperationId('saveSemanticStudioSource')
    async saveSource(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SaveSemanticStudioSourceRequest,
    ): Promise<ApiSemanticStudioSourceSaveResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getCheckoutService().saveSource(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * One workspace in this project.
     * @summary Get a Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/workspaces/{workspaceUuid}')
    @OperationId('getSemanticStudioWorkspace')
    async getWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() workspaceUuid: UUID,
    ): Promise<ApiSemanticStudioWorkspaceResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getWorkspace(
                toSessionUser(req.account),
                projectUuid,
                workspaceUuid,
            ),
        };
    }

    /**
     * Renames one of your workspaces.
     * @summary Rename a Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/workspaces/{workspaceUuid}')
    @OperationId('renameSemanticStudioWorkspace')
    async renameWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() workspaceUuid: UUID,
        @Body() body: SemanticStudioWorkspaceRenameBody,
    ): Promise<ApiSemanticStudioWorkspaceResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().renameWorkspace(
                toSessionUser(req.account),
                projectUuid,
                workspaceUuid,
                body.name,
            ),
        };
    }

    /**
     * Makes one of your workspaces the active one.
     * @summary Switch to a Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/workspaces/{workspaceUuid}/activate')
    @OperationId('activateSemanticStudioWorkspace')
    async activateWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() workspaceUuid: UUID,
    ): Promise<ApiSemanticStudioWorkspaceResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().activateWorkspace(
                toSessionUser(req.account),
                projectUuid,
                workspaceUuid,
            ),
        };
    }

    /**
     * One of your workspaces' changes replayed on what is live, without changes from before drafts had workspaces.
     * @summary Get a Semantic Studio workspace's draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/workspaces/{workspaceUuid}/draft')
    @OperationId('getSemanticStudioWorkspaceDraft')
    async getWorkspaceDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() workspaceUuid: UUID,
    ): Promise<ApiSemanticLayerDraftResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getWorkspaceDraft(
                toSessionUser(req.account),
                projectUuid,
                workspaceUuid,
            ),
        };
    }

    /**
     * Ends one of your workspaces after its changes were discarded; it stays as history.
     * @summary Finish a Semantic Studio workspace
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/workspaces/{workspaceUuid}/finish')
    @OperationId('finishSemanticStudioWorkspace')
    async finishWorkspace(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() workspaceUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().finishWorkspace(
            toSessionUser(req.account),
            projectUuid,
            workspaceUuid,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * A model's YAML and its recorded changes, or null when the project keeps no such model.
     * @summary Get a semantic layer model
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/models/{modelName}')
    @OperationId('getSemanticLayerModel')
    async getModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() modelName: string,
    ): Promise<ApiSemanticLayerModelResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getModel(
                toSessionUser(req.account),
                projectUuid,
                modelName,
            ),
        };
    }

    /**
     * A value that changes whenever this person's draft would read differently.
     * @summary Get the state of my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/draft/state')
    @OperationId('getSemanticLayerDraftState')
    async getDraftState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerDraftStateResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getDraftState(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * The models this person has changes in development on, by name.
     * @summary List the models in my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/draft/models')
    @OperationId('getSemanticLayerDraftedModels')
    async getDraftedModels(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerDraftedModelsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getDraftedModels(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * This person's draft of the semantic layer, replayed on what is live now.
     * @summary Get my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/draft')
    @OperationId('getSemanticLayerDraft')
    async getDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerDraftResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getDraft(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Saved charts and dashboards that this person's draft would break.
     * @summary Get what my semantic layer draft would break
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/draft/impact')
    @OperationId('getSemanticLayerDraftImpact')
    async getDraftImpact(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() model?: string,
    ): Promise<ApiSemanticLayerDraftImpactResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getDraftImpact(
                toSessionUser(req.account),
                projectUuid,
                model ?? null,
            ),
        };
    }

    /**
     * Saved charts and dashboards that read any of the given fields, which a pull request defines differently or removes.
     * @summary Get the saved content that reads changed fields
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/field-usage')
    @OperationId('getSemanticLayerFieldUsage')
    async getFieldUsage(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SemanticLayerFieldUsageBody,
    ): Promise<ApiSemanticLayerDraftUsageResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getFieldUsage(
                toSessionUser(req.account),
                projectUuid,
                body.fields,
            ),
        };
    }

    /**
     * Saved charts and dashboards that read a field this person's draft defines differently or removes.
     * @summary Get the saved content my semantic layer draft changes
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/draft/usage')
    @OperationId('getSemanticLayerDraftUsage')
    async getDraftUsage(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerDraftUsageResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().getDraftUsage(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * Checks this person's draft against saved charts and dashboards again, in the background.
     * @summary Check what my semantic layer draft would break
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/impact')
    @OperationId('checkSemanticLayerDraftImpact')
    async checkDraftImpact(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().requestDraftImpactCheck(
            toSessionUser(req.account),
            projectUuid,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Takes this person's whole draft live as one change, or none of it when any part fails its checks.
     * @summary Apply my semantic layer draft
     * @param merge For a project whose models live in a repository, also merge the pull request the draft is sent as.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/apply')
    @OperationId('applySemanticLayerDraft')
    async applyDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() merge?: boolean,
    ): Promise<ApiSemanticLayerDraftApplyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().applyDraft(
                toSessionUser(req.account),
                projectUuid,
                null,
                merge === true,
            ),
        };
    }

    /**
     * Takes one model from this person's draft live, or nothing when it fails its checks.
     * @summary Apply one model from my semantic layer draft
     * @param merge For a project whose models live in a repository, also merge the pull request the model is sent as.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/models/{model}/apply')
    @OperationId('applySemanticLayerDraftModel')
    async applyDraftModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
        @Query() merge?: boolean,
    ): Promise<ApiSemanticLayerDraftApplyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().applyDraft(
                toSessionUser(req.account),
                projectUuid,
                model,
                merge === true,
            ),
        };
    }

    /**
     * Takes one model out of this person's draft.
     * @summary Discard one model from my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/draft/models/{model}')
    @OperationId('discardSemanticLayerDraftModel')
    async discardDraftModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().discardDraft(
            toSessionUser(req.account),
            projectUuid,
            { kind: 'model', model },
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Discards this person's whole draft.
     * @summary Discard my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/draft')
    @OperationId('discardSemanticLayerDraft')
    async discardDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().discardDraft(
            toSessionUser(req.account),
            projectUuid,
            { kind: 'all' },
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Moves one change one place earlier or later in this person's draft.
     * @summary Reorder a change in my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/changes/{draftChangeUuid}/move')
    @OperationId('moveSemanticLayerDraftChange')
    async moveDraftChange(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() draftChangeUuid: UUID,
        @Body() body: ApiSemanticLayerDraftMoveRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().moveDraftChange(
            toSessionUser(req.account),
            projectUuid,
            draftChangeUuid,
            body.direction,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Keeps this person's draft of a model over what was published to it since they started.
     * @summary Keep my draft of a model over what was published since
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/models/{model}/keep')
    @OperationId('keepSemanticLayerDraftModel')
    async keepDraftModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
        @Body() body: ApiSemanticLayerDraftKeepRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().keepDraftModel(
            toSessionUser(req.account),
            projectUuid,
            model,
            body.liveVersion,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Saves a hand edit of one model's YAML into this person's draft, checked the way an agent's change is.
     * @summary Save an edit of a model to my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/models/{model}/edit')
    @OperationId('saveSemanticLayerDraftModel')
    async saveDraftModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
        @Body() body: SaveSemanticLayerDraftModelRequest,
    ): Promise<ApiSemanticLayerDraftModelSaveResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().saveDraftModel(
                toSessionUser(req.account),
                projectUuid,
                model,
                body,
            ),
        };
    }

    /**
     * Leaves one part of this person's drafted model as it is live.
     * @summary Take the live version of one part of my drafted model
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/models/{model}/take-live')
    @OperationId('takeLiveSemanticLayerDraftPart')
    async takeLiveDraftPart(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
        @Body() body: ApiSemanticLayerDraftTakeLiveRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().takeLiveDraftPart(
            toSessionUser(req.account),
            projectUuid,
            model,
            body.path,
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Takes one change out of this person's draft.
     * @summary Discard a change from my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/draft/changes/{draftChangeUuid}')
    @OperationId('discardSemanticLayerDraftChange')
    async discardDraftChange(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() draftChangeUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().discardDraft(
            toSessionUser(req.account),
            projectUuid,
            { kind: 'change', changeUuid: draftChangeUuid },
        );
        return { status: 'ok', results: undefined };
    }

    /**
     * Reverts what the given change sets wrote, as one new change.
     * @summary Undo semantic layer changes
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/undo')
    @OperationId('undoSemanticLayerChanges')
    async undo(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: SemanticLayerUndoRequest,
    ): Promise<ApiSemanticLayerUndoResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().undo(
                toSessionUser(req.account),
                projectUuid,
                body.changeSetUuids,
            ),
        };
    }
}
