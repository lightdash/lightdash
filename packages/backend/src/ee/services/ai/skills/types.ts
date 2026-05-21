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
};

export type AiAgentSkillReference = Pick<
    AiAgentSkill,
    'name' | 'description'
> & {
    resources: Array<Pick<AiAgentSkillResource, 'name' | 'description'>>;
};
