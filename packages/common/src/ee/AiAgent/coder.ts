import type { ContentAsCodeType } from '../../types/coder';
import type { AiAgentModelConfig } from './requestTypes';

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
    modelConfig: AiAgentModelConfig | null;
    updatedAt?: Date;
    downloadedAt?: Date;
};

export type AgentAsCodeUpsertChanges = {
    created: string[];
    updated: string[];
    unchanged: string[];
    deleted: string[];
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
