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

export const asyncForEach = async <T>(
    array: T[],
    callback: (value: T, index: number, array: T[]) => Promise<void>,
) => {
    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < array.length; index++) {
        // eslint-disable-next-line no-await-in-loop
        await callback(array[index], index, array);
    }
};
