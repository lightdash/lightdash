import { isValidFrequency } from '@lightdash/common';

type FieldValidator<T> = (
    fieldName: string,
) => (value: T | undefined) => string | undefined;

export const everyValidator = (
    field: string,
    ...validators: FieldValidator<string>[]
) => {
    return (input: string) => {
        for (const validator of validators) {
            const error = validator(field)(input);
            if (error) {
                return error;
            }
        }
    };
};

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
    !value || value.match(/.+\/.+/) || value.match(/^[a-zA-Z0-9.%_-]+$/)
        ? undefined
        : `${fieldName} should match the pattern "org/project" or "project"`;

export const startWithSlash: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/^\/.*/)
        ? undefined
        : `${fieldName} should start with a "/"`;

export const startWithHTTPSProtocol: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.match(/^https:\/\/.*/)
            ? undefined
            : `${fieldName} should start with a "https://"`;

// Supports values: "1" "1,2,3" "1-3" "*/5" "*"
const cronValueRegex = new RegExp(
    /^(\*\/\d)|((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*)$/,
);
export const isInvalidCronExpression: FieldValidator<string> =
    (fieldName) => (value) => {
        if (value) {
            const cronValues = value.split(' ');
            if (cronValues.length !== 5) {
                return `${fieldName} should only have 5 values separated by a space.`;
            }
            if (
                cronValues.some((item: string) => !item.match(cronValueRegex))
            ) {
                return `${fieldName} has invalid values. Example of valid values: "1", "1,2,3", "1-3", "*/5" and "*".`;
            }
            if (!isValidFrequency(value)) {
                return `${fieldName} has invalid frequency, custom cron input is limited to hourly`;
            }
            return undefined;
        }
    };
