export type AiIdentitySchemaRule = {
    database: string;
    excludePatterns: string[];
};

export type AiIdentitySchemaRuleExpansion = {
    allowed: string[];
    excluded: string[];
};

export type AiIdentityUngrantedSchemas = {
    roleName: string;
    schemas: string[];
    fixSql: string;
};
