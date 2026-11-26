import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type AiWebAppThreadCreatedFrom,
    type ApiAiAgentThreadCreateRequest,
    type ApiAiAgentThreadMessageCreateRequest,
    type ApiAiAgentThreadStreamRequest,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { BaseService } from '../../../services/BaseService';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import { findSemanticStudioPreset } from '../ai/models/modelPreference';
import { type AgentTurnInputs } from '../ai/types/agentTurnSetup';
import {
    type AiAgentService,
    type AuthorizedAgentThread,
} from '../AiAgentService/AiAgentService';
import { type AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { type SemanticStudioCheckoutService } from './SemanticStudioCheckoutService';
import { type SemanticStudioService } from './SemanticStudioService';
import { getStudioAgentTools } from './studioAgentTools';

export type SemanticStudioChatServiceArguments = {
    ai: Pick<
        AiAgentService,
        | 'getIsCopilotEnabled'
        | 'getThreadForAuthorized'
        | 'createThreadForAgent'
        | 'createMessageForAuthorized'
        | 'streamResponseForAuthorized'
        | 'interruptMessageForAuthorized'
        | 'steerMessageForAuthorized'
        | 'generateTitleForAuthorized'
        | 'getArtifactVizQueryForAuthorized'
        | 'getArtifactQueryResultsForAuthorized'
        | 'updateArtifactVersionForAuthorized'
    >;
    checkout: Pick<
        SemanticStudioCheckoutService,
        'getAgentTurnSetup' | 'findDevelopmentExplores' | 'waitForBranchCompile'
    > & {
        getBuilderAgent: (
            user: SessionUser,
            projectUuid: string,
        ) => Promise<{ uuid: string }>;
    };
    studio: Pick<
        SemanticStudioService,
        | 'getStatus'
        | 'assertCanStartThread'
        | 'proposeDraftChange'
        | 'draftProjectContextEntry'
        | 'listChanges'
        | 'readDraftedModel'
    >;
    aiWriteback: Pick<AiWritebackService, 'hasRunInProgress'>;
    aiAgentModel: Pick<AiAgentModel, 'getAgent' | 'getThread' | 'getArtifact'>;
    workspaceModel: Pick<
        SemanticStudioWorkspaceModel,
        'findStudioThreadAgentUuid'
    >;
};

type ThreadRef = { projectUuid: string; threadUuid: string };
type MessageRef = ThreadRef & { messageUuid: string };
type ArtifactRef = {
    projectUuid: string;
    artifactUuid: string;
    versionUuid: string;
};

/** The Studio chat's own way in: it finds the agent a conversation runs on and decides who may use it. */
export class SemanticStudioChatService extends BaseService {
    private readonly ai: SemanticStudioChatServiceArguments['ai'];

    private readonly checkout: SemanticStudioChatServiceArguments['checkout'];

    private readonly studio: SemanticStudioChatServiceArguments['studio'];

    private readonly aiWriteback: SemanticStudioChatServiceArguments['aiWriteback'];

    private readonly aiAgentModel: SemanticStudioChatServiceArguments['aiAgentModel'];

    private readonly workspaceModel: SemanticStudioChatServiceArguments['workspaceModel'];

    constructor(args: SemanticStudioChatServiceArguments) {
        super();
        this.ai = args.ai;
        this.checkout = args.checkout;
        this.studio = args.studio;
        this.aiWriteback = args.aiWriteback;
        this.aiAgentModel = args.aiAgentModel;
        this.workspaceModel = args.workspaceModel;
    }

    private async assertCopilotEnabled(user: SessionUser): Promise<void> {
        if (!(await this.ai.getIsCopilotEnabled(user))) {
            throw new ForbiddenError('Copilot is not enabled');
        }
    }

    // A Studio chat is for someone who can use Studio here, and is its owner's or anyone's who manages agents.
    private async authorizeThread(
        user: SessionUser,
        { projectUuid, threadUuid }: ThreadRef,
        { checksCopilot, refusal }: { checksCopilot: boolean; refusal: string },
    ): Promise<AuthorizedAgentThread> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        if (checksCopilot) await this.assertCopilotEnabled(user);

        // Older conversations run on an ordinary agent, newer ones on the built-in one.
        const agentUuid = await this.workspaceModel.findStudioThreadAgentUuid(
            projectUuid,
            threadUuid,
        );
        if (!agentUuid) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });
        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        const { enabled: canUseStudio } = await this.studio.getStatus(
            user,
            projectUuid,
        );
        const isTheirs = thread.user.uuid === user.userUuid;
        if (
            !canUseStudio ||
            (!isTheirs &&
                this.createAuditedAbility(user).cannot(
                    'manage',
                    subject('AiAgent', { organizationUuid, projectUuid }),
                ))
        ) {
            throw new ForbiddenError(refusal);
        }
        return { agent, thread };
    }

    // An artifact is its thread's: whoever may use the Studio conversation may read what it made.
    private async authorizeArtifact(
        user: SessionUser,
        { projectUuid, artifactUuid, versionUuid }: ArtifactRef,
        refusal: string,
    ) {
        if (!user.organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        await this.assertCopilotEnabled(user);
        // The model answers not found for a missing artifact, as it does on the agent routes.
        const artifact = await this.aiAgentModel.getArtifact(
            artifactUuid,
            versionUuid,
        );
        const authorized = await this.authorizeThread(
            user,
            { projectUuid, threadUuid: artifact.threadUuid },
            { checksCopilot: false, refusal },
        ).catch((error: unknown) => {
            // An artifact of some other thread is refused, as the agent routes refuse it.
            throw error instanceof NotFoundError
                ? new ForbiddenError(refusal)
                : error;
        });
        return { authorized, artifact };
    }

    async getArtifact(user: SessionUser, ref: ArtifactRef) {
        const { artifact } = await this.authorizeArtifact(
            user,
            ref,
            'Insufficient permissions to access this artifact',
        );
        return artifact;
    }

    async getArtifactVizQuery(
        user: SessionUser,
        ref: ArtifactRef,
        account: RegisteredAccount,
    ) {
        const { authorized, artifact } = await this.authorizeArtifact(
            user,
            ref,
            'Insufficient permissions to access this artifact',
        );
        return this.ai.getArtifactVizQueryForAuthorized(
            user,
            authorized,
            artifact,
            account,
        );
    }

    async getArtifactQueryResults(
        user: SessionUser,
        ref: ArtifactRef,
        page: {
            queryUuid: string;
            page: number | null;
            pageSize: number | null;
        },
        account: RegisteredAccount,
    ) {
        const { authorized, artifact } = await this.authorizeArtifact(
            user,
            ref,
            'Insufficient permissions to access this artifact',
        );
        return this.ai.getArtifactQueryResultsForAuthorized(
            user,
            authorized,
            artifact,
            page,
            account,
        );
    }

    /** Records the SQL chart a result was saved as. */
    async linkArtifactSavedSql(
        user: SessionUser,
        ref: ArtifactRef,
        savedSqlUuid: string | null,
    ) {
        const { authorized } = await this.authorizeArtifact(
            user,
            ref,
            'Insufficient permissions to update this artifact',
        );
        return this.ai.updateArtifactVersionForAuthorized(
            authorized,
            ref.versionUuid,
            { savedSqlUuid },
        );
    }

    // What a Studio conversation brings to each turn: its mode and card, and the builder's own tools.
    private getTurnInputs(
        user: SessionUser,
        projectUuid: string,
    ): AgentTurnInputs {
        return {
            getTurnSetup: () =>
                this.checkout.getAgentTurnSetup(user, projectUuid),
            buildExtraTools: ({ threadUuid, ...turn }) =>
                getStudioAgentTools({
                    ...turn,
                    threadUuid,
                    user,
                    projectUuid,
                    semanticStudioService: this.studio,
                    semanticStudioCheckoutService: this.checkout,
                    isSaving: () =>
                        this.aiWriteback.hasRunInProgress(threadUuid),
                }),
        };
    }

    async createThread(
        user: SessionUser,
        projectUuid: string,
        body: ApiAiAgentThreadCreateRequest,
        surface: AiWebAppThreadCreatedFrom,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        // The handout checks AI is live and that this person can use Studio here.
        const { uuid: agentUuid } = await this.checkout.getBuilderAgent(
            user,
            projectUuid,
        );
        await this.assertCopilotEnabled(user);
        await this.studio.assertCanStartThread(user, projectUuid, surface);
        return this.ai.createThreadForAgent(
            user,
            await this.aiAgentModel.getAgent({ organizationUuid, agentUuid }),
            { ...body, createdFrom: 'semantic_studio' },
            surface,
            undefined,
            findSemanticStudioPreset,
        );
    }

    async getThread(user: SessionUser, ref: ThreadRef) {
        return this.ai.getThreadForAuthorized(
            user,
            await this.authorizeThread(user, ref, {
                checksCopilot: true,
                refusal: 'Insufficient permissions to view this thread',
            }),
        );
    }

    async createMessage(
        user: SessionUser,
        ref: ThreadRef,
        body: ApiAiAgentThreadMessageCreateRequest,
    ) {
        return this.ai.createMessageForAuthorized(
            user,
            await this.authorizeThread(user, ref, {
                checksCopilot: true,
                refusal:
                    'Insufficient permissions to create messages for this thread',
            }),
            body,
            undefined,
            findSemanticStudioPreset,
        );
    }

    async streamResponse(
        user: SessionUser,
        ref: ThreadRef,
        body: ApiAiAgentThreadStreamRequest | undefined,
    ) {
        return this.ai.streamResponseForAuthorized(
            user,
            // The turn itself checks AI is on, and records why when it is not.
            await this.authorizeThread(user, ref, {
                checksCopilot: false,
                refusal: 'Insufficient permissions to access this agent thread',
            }),
            {
                enableSqlMode: body?.enableSqlMode,
                enableFastDecisions: body?.enableFastDecisions ?? true,
                autoApproveSql: body?.autoApproveSql ?? false,
                toolHints: body?.toolHints ?? [],
            },
            this.getTurnInputs(user, ref.projectUuid),
        );
    }

    async generateTitle(user: SessionUser, ref: ThreadRef) {
        return this.ai.generateTitleForAuthorized(
            user,
            await this.authorizeThread(user, ref, {
                checksCopilot: true,
                refusal: 'Insufficient permissions to access this agent thread',
            }),
        );
    }

    async interruptMessage(user: SessionUser, ref: MessageRef) {
        return this.ai.interruptMessageForAuthorized(
            user,
            await this.authorizeThread(user, ref, {
                checksCopilot: false,
                refusal:
                    'Insufficient permissions to interrupt this agent thread',
            }),
            ref.messageUuid,
        );
    }

    async steerMessage(user: SessionUser, ref: MessageRef, message: string) {
        return this.ai.steerMessageForAuthorized(
            user,
            await this.authorizeThread(user, ref, {
                checksCopilot: false,
                refusal: 'Insufficient permissions to steer this agent thread',
            }),
            ref.messageUuid,
            message,
        );
    }
}
