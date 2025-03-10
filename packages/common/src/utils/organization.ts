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
        const error = parsedOrganizationName.error.errors[0];
        if (error.code === 'custom') {
            throw new ParameterError(error.message);
        }
        throw new ParameterError(parsedOrganizationName.error.message);
    }
};
