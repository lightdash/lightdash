import type { ContentAsCodeType } from '../../types/coder';
import type { AiAgentModelConfig } from './requestTypes';

export type AgentAsCodeEvaluationPrompt = {
    prompt: string;
    expectedResponse: string | null;
};

export type AgentAsCodeEvaluation = {
    title: string;
    prompts: AgentAsCodeEvaluationPrompt[];
};

export type AgentAsCode = {
    contentType: ContentAsCodeType.AI_AGENT;
    version: number;
    agentVersion: 1 | 2;
    slug: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    instruction: string | null;
    tags: string[] | null;
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;
    enableContentTools: boolean;
    enableUserContext: boolean;
    enableSqlMode?: boolean;
    // Managed only when the org's AI thread retention flag is on (flag-off
    // uploads warn and ignore it). Omitted = leave unchanged; null = clear.
    threadRetentionHours?: number | null;
    modelConfig: AiAgentModelConfig | null;
    evaluations?: AgentAsCodeEvaluation[];
    updatedAt?: Date;
    downloadedAt?: Date;
};

export type AgentAsCodeUpsertChanges = {
    created: string[];
    updated: string[];
    unchanged: string[];
    deleted: string[];
    // Optional so a NEW CLI stays compatible with older servers that never
    // send the field.
    warnings?: string[];
};

export type ApiAgentAsCodeListResponse = {
    status: 'ok';
    results: {
        agents: AgentAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};

export type ApiAgentAsCodeUpsertResponse = {
    status: 'ok';
    results: AgentAsCodeUpsertChanges;
};
