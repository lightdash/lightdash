import { validateOrganizationName } from '@lightdash/common';

const APOSTROPHE_LIKE = new Set(["'", '’', '`']);

export const inferOrganizationName = (domain: string): string =>
    (domain.split('.')[0] ?? '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const sanitizeDetectedOrganizationName = (
    name: string,
    fallback: string,
): string => {
    if (validateOrganizationName(name)) return name.trim();

    const withoutAccents = name.normalize('NFKD').replace(/[̀-ͯ]/g, '');

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
