import {
    type AiIdentitySchemaRule,
    type AiIdentitySchemaRuleExpansion,
} from '../types/aiIdentitySchemaRule';
import { ParameterError } from '../types/errors';

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

export const expandSchemaPatterns = (
    selection: { database: string; patterns: string[] },
    catalogSchemas: readonly string[],
): { matched: string[]; unmatched: string[] } => {
    const patterns = selection.patterns.map(toRegExp);
    const unmatched: string[] = [];
    const matched: string[] = [];
    catalogSchemas.forEach((qualified) => {
        const parts = splitSchema(qualified);
        if (
            parts === null ||
            !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(parts.database) ||
            !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(parts.schema) ||
            parts.database.toUpperCase() !== selection.database.toUpperCase() ||
            SYSTEM_SCHEMAS.has(parts.schema.toUpperCase())
        )
            return;
        const matches = patterns.some((pattern) => pattern.test(parts.schema));
        (matches ? matched : unmatched).push(qualified);
    });
    return { matched: unique(matched), unmatched: unique(unmatched) };
};

export const expandAiIdentitySchemaRule = (
    rule: AiIdentitySchemaRule,
    catalogSchemas: readonly string[],
): AiIdentitySchemaRuleExpansion => {
    const { matched, unmatched } = expandSchemaPatterns(
        { database: rule.database, patterns: rule.excludePatterns },
        catalogSchemas,
    );
    const patterns = rule.excludePatterns.map(toRegExp);
    const excludedByPattern = rule.excludePatterns.map((pattern) => ({
        pattern,
        count: 0,
    }));
    matched.forEach((qualified) => {
        const index = patterns.findIndex((pattern) =>
            pattern.test(qualified.split('.')[1]),
        );
        excludedByPattern[index].count += 1;
    });
    return { allowed: unmatched, excluded: matched, excludedByPattern };
};
