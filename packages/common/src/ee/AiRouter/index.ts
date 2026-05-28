import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';

export type AiRouter = {
    routerUuid: string;
    organizationUuid: string;
    enabled: boolean;
    projectUuids: string[];
    createdAt: Date;
    updatedAt: Date;
};

export type ApiAiRouterResponse = ApiSuccess<AiRouter>;

export type UpsertAiRouterRequest = {
    enabled?: boolean;
    projectUuids?: string[];
};

export type AiRouterDecisionConfidence = 'high' | 'medium' | 'low';

export type AiRouterSelectionMode = 'auto_routed' | 'manual_pick';

export type AiRouterDecisionCandidate = {
    agentUuid: string;
    name: string;
    description: string | null;
};

export type AiRouterDecision = {
    decisionUuid: string;
    routerUuid: string;
    threadUuid: string | null;
    userUuid: string;
    prompt: string;
    suggestedAgentUuid: string;
    chosenAgentUuid: string | null;
    confidence: AiRouterDecisionConfidence;
    reasoning: string;
    candidateAgentUuids: string[];
    selectionMode: AiRouterSelectionMode | null;
    createdAt: Date;
    committedAt: Date | null;
};

export type AiRouterRouteRequest = {
    prompt: string;
    projectUuid: string;
};

export type AiRouterRouteNextAction = 'create_thread' | 'show_picker';

export type AiRouterRouteDecision = {
    decisionUuid: string;
    suggestedAgentUuid: string;
    confidence: AiRouterDecisionConfidence;
    reasoning: string;
    candidates: AiRouterDecisionCandidate[];
};

export type AiRouterRouteResponseResult = {
    decision: AiRouterRouteDecision;
    nextAction: AiRouterRouteNextAction;
};

export type ApiAiRouterRouteResponse = ApiSuccess<AiRouterRouteResponseResult>;

export type AiRouterDecisionCommitRequest = {
    chosenAgentUuid: string;
    threadUuid: string;
};

export type ApiAiRouterDecisionCommitResponse = ApiSuccessEmpty;

export type AiRouterDecisionListFilters = {
    confidence?: AiRouterDecisionConfidence;
    selectionMode?: AiRouterSelectionMode;
    fromDate?: string;
    toDate?: string;
};

export type ApiAiRouterDecisionListResponse = ApiSuccess<AiRouterDecision[]>;
