import { validateEmail } from 'common';
import { ParameterError } from './errors';

export const sanitizeStringParam = (value: any) => {
    if (!value || typeof value !== 'string') {
        throw new ParameterError();
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length <= 0) {
        throw new ParameterError();
    }
    return trimmedValue;
};

export const sanitizeEmailParam = (value: any) => {
    const email = sanitizeStringParam(value);
    if (!validateEmail(email)) {
        throw new ParameterError();
    }
    return email;
};
