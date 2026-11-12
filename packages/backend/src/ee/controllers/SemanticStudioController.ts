import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSemanticLayerDraftApplyResponse,
    type ApiSemanticLayerDraftedModelsResponse,
    type ApiSemanticLayerDraftImpactResponse,
    type ApiSemanticLayerDraftKeepRequest,
    type ApiSemanticLayerDraftMoveRequest,
    type ApiSemanticLayerDraftResponse,
    type ApiSemanticLayerDraftStateResponse,
    type ApiSemanticLayerDraftTakeLiveRequest,
    type ApiSemanticLayerDraftUsageResponse,
    type ApiSemanticLayerModelResponse,
    type ApiSemanticLayerStatusResponse,
    type ApiSemanticLayerStoredModelsResponse,
    type ApiSemanticLayerUndoResponse,
    type ApiSuccessEmpty,
    type SemanticLayerUndoRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type SemanticStudioService } from '../services/SemanticStudioService/SemanticStudioService';

@Route('/api/v1/projects/{projectUuid}/semantic-studio')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Semantic Studio')
export class SemanticStudioController extends BaseController {
    private getService(): SemanticStudioService {
        return this.services.getSemanticStudioService<SemanticStudioService>();
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
            results: await this.getService().getStatus(
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
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/apply')
    @OperationId('applySemanticLayerDraft')
    async applyDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSemanticLayerDraftApplyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().applyDraft(
                toSessionUser(req.account),
                projectUuid,
                null,
            ),
        };
    }

    /**
     * Takes one model from this person's draft live, or nothing when it fails its checks.
     * @summary Apply one model from my semantic layer draft
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/draft/models/{model}/apply')
    @OperationId('applySemanticLayerDraftModel')
    async applyDraftModel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() model: string,
    ): Promise<ApiSemanticLayerDraftApplyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().applyDraft(
                toSessionUser(req.account),
                projectUuid,
                model,
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
