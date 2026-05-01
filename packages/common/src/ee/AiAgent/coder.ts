import type { ContentAsCodeType } from '../../types/coder';
import type { AiAgent } from './index';

export type AgentAsCode = Pick<
    AiAgent,
    | 'name'
    | 'description'
    | 'imageUrl'
    | 'instruction'
    | 'tags'
    | 'enableDataAccess'
    | 'enableSelfImprovement'
> & {
    /** Slug used as identity within a project. Stable across renames. */
    slug: string;
    /** Schema version for this agent configuration */
    version: number;
    /** Content type discriminator */
    contentType?: ContentAsCodeType.AI_AGENT;
    /** Server-set; useful to know if the agent has been updated. Defaults to now if omitted. */
    updatedAt?: Date;
    /** Server-set; tracks when this agent was downloaded from Lightdash */
    downloadedAt?: Date;
};

export type AgentAsCodeUpsertChanges = {
    created: string[];
    updated: string[];
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
