import type { ServedSkillMetadata } from '@lightdash/common';

export type AiAgentSkillResource = {
    name: string;
    description: string;
    content: string;
};

export type AiAgentSkill = {
    name: string;
    description: string;
    body: string;
    resources?: AiAgentSkillResource[];
    /** Served-version record written to the loadSkill tool result. */
    metadata?: ServedSkillMetadata;
};

export type AiAgentSkillReference = Pick<
    AiAgentSkill,
    'name' | 'description'
> & {
    resources: Array<Pick<AiAgentSkillResource, 'name' | 'description'>>;
};
