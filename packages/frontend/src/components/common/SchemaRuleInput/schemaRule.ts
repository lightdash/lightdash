import {
    AiIdentitySchemaRuleMode,
    assertUnreachable,
    isValidSchemaPattern,
    type AiIdentitySchemaRule,
} from '@lightdash/common';

export const isValidSchemaRule = (rule: AiIdentitySchemaRule): boolean => {
    switch (rule.mode) {
        case AiIdentitySchemaRuleMode.EXISTING_ROLE:
            return true;
        case AiIdentitySchemaRuleMode.LIST:
            return rule.schemas.length > 0;
        case AiIdentitySchemaRuleMode.ALL_EXCEPT:
        case AiIdentitySchemaRuleMode.ONLY_MATCHING:
            return (
                !!rule.database.trim() &&
                rule.patterns.length > 0 &&
                rule.patterns.every(isValidSchemaPattern)
            );
        default:
            return assertUnreachable(rule, 'Unknown schema rule');
    }
};

export type SchemaRulePreviewText = {
    allowed: string;
    excluded: string;
    listed: 'allowed' | 'excluded';
};

export const aiRolePreviewText: SchemaRulePreviewText = {
    allowed: 'allowed',
    excluded: 'excluded',
    listed: 'excluded',
};
