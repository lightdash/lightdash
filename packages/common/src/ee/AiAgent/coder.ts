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

// Markdown or plain text, 20 KB max. The CLI stores it in its own file
// beside the agent YAML and inlines it for transport.
export type AgentAsCodeKnowledgeDocument = {
    name: string;
    alwaysIncludeInContext: boolean;
    content: string;
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
    enableSqlAutoApproval?: boolean;
    enableComposerQueries?: boolean;
    // Managed only when the org's AI thread retention flag is on (flag-off
    // uploads warn and ignore it). Omitted = leave unchanged; null = clear.
    threadRetentionHours?: number | null;
    modelConfig: AiAgentModelConfig | null;
    // Custom skill names bound to the agent. Omitted = leave bindings
    // unchanged; present = authoritative (bind these, unbind the rest).
    skills?: string[];
    evaluations?: AgentAsCodeEvaluation[];
    // Knowledge documents owned by this agent alone. Omitted = leave them
    // unchanged; present = authoritative (create, update, delete the rest).
    // Documents shared with other agents or the whole organization are
    // never included and never touched.
    knowledgeDocuments?: AgentAsCodeKnowledgeDocument[];
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
    // Agents skipped because something they reference does not exist, such
    // as a skill name that is neither in the upload nor on the server.
    failed?: { slug: string; message: string }[];
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
