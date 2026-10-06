import {
    AiIdentitySchemaRuleMode,
    type AiIdentitySchemaRule,
    type AiIdentitySchemaRuleExpansion,
} from '../types/aiIdentitySchemaRule';
import { ParameterError } from '../types/errors';
import assertUnreachable from './assertUnreachable';

const SYSTEM_SCHEMAS = new Set(['INFORMATION_SCHEMA']);

export const isValidSchemaPattern = (pattern: string): boolean =>
    /^[A-Za-z0-9_$*?]+$/.test(pattern.trim());

const toRegExp = (pattern: string): RegExp => {
    const trimmed = pattern.trim();
    if (!isValidSchemaPattern(trimmed))
        throw new ParameterError(
            `Invalid schema pattern "${pattern}". Use letters, digits, _, $, * and ?.`,
        );
    const source = trimmed
        .replace(/\$/g, '\\$')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${source}$`, 'i');
};

export const matchesSchemaPattern = (
    schemaName: string,
    patterns: readonly string[],
): boolean => patterns.some((pattern) => toRegExp(pattern).test(schemaName));

const splitSchema = (
    qualified: string,
): { database: string; schema: string } | null => {
    const parts = qualified.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { database: parts[0], schema: parts[1] };
};

const unique = (values: string[]): string[] =>
    [
        ...new Map(
            values.map((value) => [value.toUpperCase(), value]),
        ).values(),
    ].sort((a, b) => a.localeCompare(b));

export const expandAiIdentitySchemaRule = (
    rule: AiIdentitySchemaRule,
    catalogSchemas: readonly string[],
): AiIdentitySchemaRuleExpansion => {
    switch (rule.mode) {
        case AiIdentitySchemaRuleMode.EXISTING_ROLE:
            return { allowed: [], excluded: [] };
        case AiIdentitySchemaRuleMode.LIST:
            return { allowed: unique(rule.schemas), excluded: [] };
        case AiIdentitySchemaRuleMode.ALL_EXCEPT:
        case AiIdentitySchemaRuleMode.ONLY_MATCHING: {
            rule.patterns.forEach(toRegExp);
            const inDatabase = catalogSchemas.filter((qualified) => {
                const parts = splitSchema(qualified);
                return (
                    parts !== null &&
                    parts.database.toUpperCase() ===
                        rule.database.toUpperCase() &&
                    !SYSTEM_SCHEMAS.has(parts.schema.toUpperCase())
                );
            });
            const allowed: string[] = [];
            const excluded: string[] = [];
            inDatabase.forEach((qualified) => {
                const { schema } = splitSchema(qualified)!;
                const matches = matchesSchemaPattern(schema, rule.patterns);
                const isAllowed =
                    rule.mode === AiIdentitySchemaRuleMode.ALL_EXCEPT
                        ? !matches
                        : matches;
                (isAllowed ? allowed : excluded).push(qualified);
            });
            return { allowed: unique(allowed), excluded: unique(excluded) };
        }
        default:
            return assertUnreachable(rule, 'Unknown schema rule');
    }
};
