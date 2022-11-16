import { validateEmail } from '@lightdash/common';

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

export const startWithHTTPSProtocol: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.match(/^https:\/\/.*/)
            ? undefined
            : `${fieldName} should start with a "https://"`;

export const isValidEmail: FieldValidator<string> = (fieldName) => (value) =>
    !value || validateEmail(value) ? undefined : `${fieldName} is not valid`;

export const isValidEmailDomain: FieldValidator<string[]> =
    (fieldName) => (value) => {
        if (value) {
            const hasInvalidValue = value.some((item: string) =>
                item.match(/@/),
            );
            return hasInvalidValue
                ? `${fieldName} should not contain @, eg: (gmail.com)`
                : undefined;
        }
    };

export const isOnlyNumbers: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/\D/)
        ? `${fieldName} should only contain numbers`
        : undefined;
