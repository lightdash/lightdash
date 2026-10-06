export enum AiIdentitySchemaRuleMode {
    EXISTING_ROLE = 'existing_role',
    LIST = 'list',
    ALL_EXCEPT = 'all_except',
    ONLY_MATCHING = 'only_matching',
}

export type AiIdentityExistingRoleRule = {
    mode: AiIdentitySchemaRuleMode.EXISTING_ROLE;
};

export type AiIdentitySchemaListRule = {
    mode: AiIdentitySchemaRuleMode.LIST;
    schemas: string[];
};

export type AiIdentitySchemaPatternRule = {
    mode:
        | AiIdentitySchemaRuleMode.ALL_EXCEPT
        | AiIdentitySchemaRuleMode.ONLY_MATCHING;
    database: string;
    patterns: string[];
};

export type AiIdentitySchemaRule =
    | AiIdentityExistingRoleRule
    | AiIdentitySchemaListRule
    | AiIdentitySchemaPatternRule;

export type AiIdentitySchemaRuleExpansion = {
    allowed: string[];
    excluded: string[];
};

export type AiIdentityUngrantedSchemas = {
    roleName: string;
    schemas: string[];
    fixSql: string;
};
