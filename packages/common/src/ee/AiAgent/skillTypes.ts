export const AI_AGENT_SKILL_FILE_NAME = 'SKILL.md';
export const AI_AGENT_SKILL_RESOURCES_DIR = 'resources';
export const AI_AGENT_SKILL_NAME_MAX_LENGTH = 64;
// agentskills.io naming: lowercase letters, digits and single hyphens only.
export const AI_AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AI_AGENT_SKILL_RESERVED_NAME_PREFIX = 'lightdash-';
export const AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH = 500;
export const AI_AGENT_SKILL_BODY_MAX_BYTES = 64 * 1024;
export const AI_AGENT_SKILL_RESOURCE_MAX_BYTES = 64 * 1024;
export const AI_AGENT_SKILL_MAX_RESOURCES = 20;
export const AI_AGENT_SKILL_MAX_TOTAL_BYTES = 512 * 1024;
export const AI_AGENT_SKILL_BODY_WARN_LINES = 500;
export const AI_AGENT_SKILL_MAX_PER_AGENT = 50;
export const AI_AGENT_SKILL_LISTING_MAX_CHARS = 1536;

export type AiAgentSkillAvailability = 'agent' | 'mcp';

export type AiAgentSkillVersionSource = 'ui' | 'as_code' | 'restore' | 'system';

// Named index signatures rather than Record<string, string>: TSOA caches an
// empty model for inline Record types nested in other request bodies.
export type AiAgentSkillFiles = { [path: string]: string };
export type AiAgentSkillMetadata = { [key: string]: string };

// The hashed payload: every file as authored, keyed by path inside the folder.
export type AiAgentSkillContent = {
    schemaVersion: 1;
    files: AiAgentSkillFiles;
};

/** Frontmatter fields Lightdash honours, after defaults are applied. */
export type AiAgentSkillFrontmatter = {
    name: string;
    description: string;
    title: string | null;
    whenToUse: string | null;
    argumentHint: string | null;
    arguments: string[];
    disableModelInvocation: boolean;
    userInvocable: boolean;
    availability: AiAgentSkillAvailability[];
    metadata: AiAgentSkillMetadata;
    license: string | null;
    compatibility: string | null;
};

export type AiAgentSkillParsedResource = {
    fileName: string;
    name: string;
    description: string;
    body: string;
};

export type AiAgentSkillParsed = {
    frontmatter: AiAgentSkillFrontmatter;
    body: string;
    resources: AiAgentSkillParsedResource[];
};

export type AiAgentSkillIssueCode =
    | 'skill_file_missing'
    | 'frontmatter_invalid'
    | 'name_missing'
    | 'name_invalid'
    | 'name_reserved'
    | 'name_mismatch'
    | 'description_missing'
    | 'description_too_long'
    | 'compatibility_too_long'
    | 'field_invalid'
    | 'field_ignored'
    | 'field_rejected'
    | 'body_shell_injection'
    | 'body_file_reference'
    | 'body_env_variable'
    | 'body_too_large'
    | 'body_too_long'
    | 'resource_path_invalid'
    | 'resource_too_large'
    | 'too_many_resources'
    | 'skill_too_large'
    | 'unknown_file';

export type AiAgentSkillIssue = {
    code: AiAgentSkillIssueCode;
    message: string;
    /** File or folder path inside the skill folder the issue refers to. */
    path: string;
};

export type AiAgentSkillValidationResult =
    | {
          valid: true;
          parsed: AiAgentSkillParsed;
          /** Always empty when valid; typed as an array for the OpenAPI schema. */
          errors: AiAgentSkillIssue[];
          warnings: AiAgentSkillIssue[];
      }
    | {
          valid: false;
          parsed: null;
          errors: AiAgentSkillIssue[];
          warnings: AiAgentSkillIssue[];
      };

export type AiAgentSkillVersionSummary = {
    uuid: string;
    versionNumber: number;
    contentHash: string;
    source: AiAgentSkillVersionSource;
    restoredFromVersion: number | null;
    createdAt: Date;
    createdByUserUuid: string | null;
};

export type AiAgentSkillSummary = {
    uuid: string;
    organizationUuid: string;
    projectUuid: string | null;
    name: string;
    title: string | null;
    description: string;
    /** Frontmatter fields the chat and MCP surfaces need without the body. */
    argumentHint: string | null;
    disableModelInvocation: boolean;
    userInvocable: boolean;
    availability: AiAgentSkillAvailability[];
    currentVersion: AiAgentSkillVersionSummary;
    /** Agents this skill is bound to. */
    agentUuids: string[];
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
};

export type AiAgentSkill = AiAgentSkillSummary & {
    content: AiAgentSkillContent;
    parsed: AiAgentSkillParsed;
};

export type AiAgentSkillVersion = AiAgentSkillVersionSummary & {
    skillUuid: string;
    content: AiAgentSkillContent;
};

export type ApiCreateAiAgentSkill = {
    files: AiAgentSkillFiles;
    projectUuid: string | null;
    /** Agents to bind on creation. */
    agentUuids?: string[];
};

export type ApiUpdateAiAgentSkill = {
    files: AiAgentSkillFiles;
};

export type ApiValidateAiAgentSkill = {
    files: AiAgentSkillFiles;
};

/** A built-in skill as shown beside custom skills in binding UI and the slash menu. */
export type AiAgentBuiltInSkillSummary = {
    name: string;
    description: string;
};

export type AgentSkillsListing = {
    skills: AiAgentSkillSummary[];
    builtInSkills: AiAgentBuiltInSkillSummary[];
};

export type ApiAgentSkillsListingResponse = {
    status: 'ok';
    results: AgentSkillsListing;
};

/** Authoritative set of skills bound to one agent. */
export type ApiSetAgentSkills = {
    skillUuids: string[];
};

export type ApiAiAgentSkillSummaryListResponse = {
    status: 'ok';
    results: AiAgentSkillSummary[];
};

export type ApiAiAgentSkillResponse = {
    status: 'ok';
    results: AiAgentSkill;
};

export type ApiAiAgentSkillDeleteResponse = {
    status: 'ok';
    results: { unboundAgentUuids: string[] };
};

export type ApiAiAgentSkillVersionListResponse = {
    status: 'ok';
    results: AiAgentSkillVersionSummary[];
};

export type ApiAiAgentSkillVersionResponse = {
    status: 'ok';
    results: AiAgentSkillVersion;
};

/** A skill folder as code: `SKILL.md` and `resources/*.md`, keyed by path. */
export type SkillAsCode = {
    name: string;
    files: AiAgentSkillFiles;
};

export type SkillAsCodeUpsertChanges = {
    created: string[];
    updated: string[];
    unchanged: string[];
    deleted: string[];
    failed: { name: string; message: string }[];
    warnings: string[];
};

export type ApiSkillsAsCodeListResponse = {
    status: 'ok';
    results: { skills: SkillAsCode[]; missingNames: string[] };
};

export type ApiSkillsAsCodeUpsertRequest = {
    skills: SkillAsCode[];
    /** Names to unbind everywhere and soft-delete. Absence never deletes. */
    deleteNames?: string[];
};

export type ApiSkillsAsCodeUpsertResponse = {
    status: 'ok';
    results: SkillAsCodeUpsertChanges;
};

export type ApiAiAgentSkillValidationResponse = {
    status: 'ok';
    results: AiAgentSkillValidationResult;
};
