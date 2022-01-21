import { validateEmail } from 'common';

type FieldValidator<T> = (
    fieldName: string,
) => (value: T | undefined) => string | undefined;

export const isUppercase: FieldValidator<string> = (fieldName) => (value) =>
    !value || value === value.toUpperCase()
        ? undefined
        : `${fieldName} should be uppercase`;

export const hasNoWhiteSpaces: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.indexOf(' ') <= 0
            ? undefined
            : `${fieldName} should not have white spaces`;

export const isGitRepository: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/.+\/.+/)
        ? undefined
        : `${fieldName} should match the pattern "org/project"`;

export const startWithSlash: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/^\/.*/)
        ? undefined
        : `${fieldName} should start with a "/"`;

export const isValidEmail: FieldValidator<string> = (fieldName) => (value) =>
    !value || validateEmail(value) ? undefined : `${fieldName} is not valid`;
