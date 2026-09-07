import { z } from 'zod';
import { ParameterError } from '../types/errors';
import { getEmailDomain, validateOrganizationEmailDomains } from './email';

export const DEFAULT_ORGANIZATION_NAME = 'My organization';

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

/** "acme-analytics.com" becomes "Acme Analytics". */
export const inferOrganizationNameFromDomain = (domain: string): string =>
    (domain.split('.')[0] ?? '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

/**
 * Placeholder name for an organization created during signup, before its
 * creator confirms one. Company email domains give a useful guess; personal
 * ones fall back to a generic name.
 */
export const getDefaultOrganizationName = (
    email: string | undefined,
): string => {
    if (!email) return DEFAULT_ORGANIZATION_NAME;
    const domain = getEmailDomain(email);
    if (validateOrganizationEmailDomains([domain])) {
        return DEFAULT_ORGANIZATION_NAME;
    }
    const inferred = inferOrganizationNameFromDomain(domain);
    return validateOrganizationName(inferred)
        ? inferred
        : DEFAULT_ORGANIZATION_NAME;
};
