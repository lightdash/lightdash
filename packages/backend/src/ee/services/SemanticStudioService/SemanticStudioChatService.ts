import {
    NotFoundError,
    type AiWebAppThreadCreatedFrom,
    type ApiAiAgentThreadCreateRequest,
    type ApiAiAgentThreadMessageCreateRequest,
    type ApiAiAgentThreadStreamRequest,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import { type AiAgentService } from '../AiAgentService/AiAgentService';

export type SemanticStudioChatServiceArguments = {
    ai: Pick<
        AiAgentService,
        | 'getAgentThread'
        | 'createAgentThread'
        | 'createAgentThreadMessage'
        | 'streamAgentThreadResponse'
        | 'interruptAgentThreadMessage'
        | 'createAgentThreadMessageSteer'
        | 'generateThreadTitle'
    >;
    checkout: {
        getBuilderAgent: (
            user: SessionUser,
            projectUuid: string,
        ) => Promise<{ uuid: string }>;
    };
    workspaceModel: Pick<
        SemanticStudioWorkspaceModel,
        'findStudioThreadAgentUuid'
    >;
};

type ThreadRef = { projectUuid: string; threadUuid: string };
type MessageRef = ThreadRef & { messageUuid: string };

/** The Studio chat's own way in: it finds the agent a conversation runs on, so callers never name one. */
export class SemanticStudioChatService {
    private readonly ai: SemanticStudioChatServiceArguments['ai'];

    private readonly checkout: SemanticStudioChatServiceArguments['checkout'];

    private readonly workspaceModel: SemanticStudioChatServiceArguments['workspaceModel'];

    constructor({
        ai,
        checkout,
        workspaceModel,
    }: SemanticStudioChatServiceArguments) {
        this.ai = ai;
        this.checkout = checkout;
        this.workspaceModel = workspaceModel;
    }

    // Older conversations run on an ordinary agent, newer ones on the built-in one.
    private async getThreadAgentUuid({
        projectUuid,
        threadUuid,
    }: ThreadRef): Promise<string> {
        const agentUuid = await this.workspaceModel.findStudioThreadAgentUuid(
            projectUuid,
            threadUuid,
        );
        if (!agentUuid) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        return agentUuid;
    }

    async createThread(
        user: SessionUser,
        projectUuid: string,
        body: ApiAiAgentThreadCreateRequest,
        surface: AiWebAppThreadCreatedFrom,
    ) {
        const agent = await this.checkout.getBuilderAgent(user, projectUuid);
        return this.ai.createAgentThread(
            user,
            agent.uuid,
            { ...body, createdFrom: 'semantic_studio' },
            surface,
        );
    }

    async getThread(user: SessionUser, ref: ThreadRef) {
        return this.ai.getAgentThread(
            user,
            await this.getThreadAgentUuid(ref),
            ref.threadUuid,
        );
    }

    async createMessage(
        user: SessionUser,
        ref: ThreadRef,
        body: ApiAiAgentThreadMessageCreateRequest,
    ) {
        return this.ai.createAgentThreadMessage(
            user,
            await this.getThreadAgentUuid(ref),
            ref.threadUuid,
            body,
        );
    }

    async streamResponse(
        user: SessionUser,
        ref: ThreadRef,
        body: ApiAiAgentThreadStreamRequest | undefined,
    ) {
        return this.ai.streamAgentThreadResponse(user, {
            agentUuid: await this.getThreadAgentUuid(ref),
            threadUuid: ref.threadUuid,
            enableSqlMode: body?.enableSqlMode,
            enableFastDecisions: body?.enableFastDecisions ?? true,
            autoApproveSql: body?.autoApproveSql ?? false,
            toolHints: body?.toolHints ?? [],
        });
    }

    async generateTitle(user: SessionUser, ref: ThreadRef) {
        return this.ai.generateThreadTitle(user, {
            agentUuid: await this.getThreadAgentUuid(ref),
            threadUuid: ref.threadUuid,
        });
    }

    async interruptMessage(user: SessionUser, ref: MessageRef) {
        return this.ai.interruptAgentThreadMessage(fromSession(user), {
            ...ref,
            agentUuid: await this.getThreadAgentUuid(ref),
        });
    }

    async steerMessage(user: SessionUser, ref: MessageRef, message: string) {
        return this.ai.createAgentThreadMessageSteer(fromSession(user), {
            ...ref,
            agentUuid: await this.getThreadAgentUuid(ref),
            message,
        });
    }
}
