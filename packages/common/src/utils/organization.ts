import { z } from 'zod';
import { ParameterError } from '../types/errors';

export const validateOrganizationName = (name: string) => {
    const trimmedName = name.trim();

    if (trimmedName === '') return false;

    const pattern = /^[A-Za-z0-9 _-]+$/;
    return pattern.test(trimmedName);
};

export const getOrganizationNameSchema = () =>
    z.string().min(0).refine(validateOrganizationName, {
        message:
            'Organization name can be composed only of letters, numbers, spaces, underscores or dashes, and not be empty',
    });

export const validateOrganizationNameOrThrow = (name: string) => {
    const parsedOrganizationName = getOrganizationNameSchema().safeParse(name);

    if (!parsedOrganizationName.success) {
        const error = parsedOrganizationName.error.issues[0];
        if (error.code === 'custom') {
            throw new ParameterError(error.message);
        }
        throw new ParameterError(parsedOrganizationName.error.message);
    }
};

const APOSTROPHE_LIKE = new Set(["'", '\u2019', '`']);

export const sanitizeOrganizationName = (
    name: string,
    fallback: string,
): string => {
    if (validateOrganizationName(name)) return name.trim();

    const withoutAccents = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');

    const replaced = Array.from(withoutAccents)
        .map((character) => {
            if (character === ' ') return character;
            if (validateOrganizationName(character)) return character;
            if (APOSTROPHE_LIKE.has(character)) return '';
            return ' ';
        })
        .join('');

    const collapsed = replaced.replace(/\s+/g, ' ').trim();

    return validateOrganizationName(collapsed) ? collapsed : fallback;
};

const INVALID_CHARACTER_KINDS = new Map<string, string>([
    ['.', 'periods'],
    [',', 'commas'],
    ["'", 'apostrophes'],
    ['’', 'apostrophes'],
    ['`', 'apostrophes'],
    ['&', 'ampersands'],
    ['/', 'slashes'],
    ['\\', 'slashes'],
    [':', 'colons'],
    [';', 'semicolons'],
    ['!', 'exclamation marks'],
    ['?', 'question marks'],
    ['"', 'quotation marks'],
    ['“', 'quotation marks'],
    ['”', 'quotation marks'],
    ['(', 'parentheses'],
    [')', 'parentheses'],
    ['[', 'brackets'],
    [']', 'brackets'],
    ['+', 'plus signs'],
    ['*', 'asterisks'],
    ['#', 'hash signs'],
    ['@', 'at signs'],
    ['%', 'percent signs'],
    ['$', 'dollar signs'],
]);

const invalidCharacterKind = (character: string): string | null => {
    const folded = character.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (/^[A-Za-z]+$/.test(folded)) return 'accented characters';
    return INVALID_CHARACTER_KINDS.get(character) ?? null;
};

export type InvalidOrganizationNameMessage = {
    title: string;
    body: string;
};

const INVALID_ORGANIZATION_NAME_BODY =
    'Use letters, numbers, spaces, hyphens or underscores.';

export const describeInvalidOrganizationName = (
    name: string,
): InvalidOrganizationNameMessage => {
    if (name.trim() === '') {
        return {
            title: 'Enter an organization name',
            body: INVALID_ORGANIZATION_NAME_BODY,
        };
    }

    const kinds = new Set<string>();
    let hasUnmappedCharacter = false;

    new Set(Array.from(name)).forEach((character) => {
        if (character === ' ' || validateOrganizationName(character)) return;
        const kind = invalidCharacterKind(character);
        if (kind === null) hasUnmappedCharacter = true;
        else kinds.add(kind);
    });

    if (kinds.size === 1 && !hasUnmappedCharacter) {
        const [kind] = Array.from(kinds);
        return {
            title: `${kind.charAt(0).toUpperCase()}${kind.slice(
                1,
            )} aren't allowed`,
            body: INVALID_ORGANIZATION_NAME_BODY,
        };
    }

    return {
        title: "That name has characters we can't use",
        body: INVALID_ORGANIZATION_NAME_BODY,
    };
};

export const suggestOrganizationName = (name: string): string | null => {
    const suggestion = sanitizeOrganizationName(name, '');
    return validateOrganizationName(suggestion) && suggestion !== name.trim()
        ? suggestion
        : null;
};
