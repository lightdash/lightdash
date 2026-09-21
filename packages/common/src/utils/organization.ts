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
