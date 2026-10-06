export type AiIdentitySchemaRule = {
    database: string;
    excludePatterns: string[];
};

export type AiIdentitySchemaRuleExpansion = {
    allowed: string[];
    excluded: string[];
    excludedByPattern: { pattern: string; count: number }[];
};

export type AiIdentityUngrantedSchemas = {
    roleName: string;
    schemas: string[];
};
