import {
    AiAgentSkillContent,
    AiAgentSkillVersionSource,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiAgentSkillTableName = 'ai_agent_skill';

export type DbAiAgentSkill = {
    ai_agent_skill_uuid: string;
    organization_uuid: string;
    project_uuid: string | null;
    name: string;
    title: string | null;
    description: string;
    current_version_uuid: string | null;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentSkillTable = Knex.CompositeTableType<
    DbAiAgentSkill,
    Omit<
        DbAiAgentSkill,
        | 'ai_agent_skill_uuid'
        | 'current_version_uuid'
        | 'deleted_at'
        | 'deleted_by_user_uuid'
        | 'created_at'
        | 'updated_at'
    >,
    Partial<
        Omit<
            DbAiAgentSkill,
            | 'ai_agent_skill_uuid'
            | 'organization_uuid'
            | 'name'
            | 'created_at'
            | 'updated_at'
        >
    > & { updated_at?: Knex.Raw }
>;

export const AiAgentSkillVersionTableName = 'ai_agent_skill_version';

export type DbAiAgentSkillVersion = {
    ai_agent_skill_version_uuid: string;
    ai_agent_skill_uuid: string;
    version_number: number;
    content: AiAgentSkillContent;
    content_hash: string;
    source: AiAgentSkillVersionSource;
    restored_from_version: number | null;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type AiAgentSkillVersionTable = Knex.CompositeTableType<
    DbAiAgentSkillVersion,
    Omit<DbAiAgentSkillVersion, 'ai_agent_skill_version_uuid' | 'created_at'>,
    never
>;

export const AiAgentSkillAccessTableName = 'ai_agent_skill_access';

export type DbAiAgentSkillAccess = {
    ai_agent_skill_uuid: string;
    ai_agent_uuid: string;
    created_at: Date;
};

export type AiAgentSkillAccessTable = Knex.CompositeTableType<
    DbAiAgentSkillAccess,
    Omit<DbAiAgentSkillAccess, 'created_at'>,
    never
>;
