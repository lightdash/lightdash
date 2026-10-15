import {
    AWS_IAM_ROLE_ARN_INVALID_MESSAGE,
    isAwsIamRoleArn as matchesAwsIamRoleArn,
    isValidFrequency,
} from '@lightdash/common';
import i18n from '../i18n/i18n';

export type FieldValidator<T> = (
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

export const isRequired: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.trim() === ''
        ? i18n.t('fieldValidators.required', { ns: 'app', fieldName })
        : undefined;

export const isUppercase: FieldValidator<string> = (fieldName) => (value) =>
    !value || value === value.toUpperCase()
        ? undefined
        : i18n.t('fieldValidators.uppercase', { ns: 'app', fieldName });

export const hasNoWhiteSpaces: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.indexOf(' ') <= 0
            ? undefined
            : i18n.t('fieldValidators.noWhiteSpaces', { ns: 'app', fieldName });

export const isGitRepository: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/.+\/.+/) || value.match(/^[a-zA-Z0-9.%_-]+$/)
        ? undefined
        : i18n.t('fieldValidators.gitRepository', { ns: 'app', fieldName });

export const startWithSlash: FieldValidator<string> = (fieldName) => (value) =>
    !value || value.match(/^\/.*/)
        ? undefined
        : i18n.t('fieldValidators.startWithSlash', { ns: 'app', fieldName });

export const isAwsIamRoleArn: FieldValidator<string> =
    (_fieldName) => (value) =>
        !value || matchesAwsIamRoleArn(value)
            ? undefined
            : AWS_IAM_ROLE_ARN_INVALID_MESSAGE;

export const startWithHTTPSProtocol: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.match(/^https:\/\/.*/)
            ? undefined
            : i18n.t('fieldValidators.startWithHttps', {
                  ns: 'app',
                  fieldName,
              });

// Supports values: "1" "1,2,3" "1-3" "*/5" "*"
const cronValueRegex = new RegExp(
    /^(\*\/\d)|((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*)$/,
);
export const isInvalidCronExpression: FieldValidator<string> =
    (fieldName) => (value) => {
        if (value) {
            const cronValues = value.split(' ');
            if (cronValues.length !== 5) {
                return i18n.t('fieldValidators.cronFiveValues', {
                    ns: 'app',
                    fieldName,
                });
            }
            if (
                cronValues.some((item: string) => !item.match(cronValueRegex))
            ) {
                return i18n.t('fieldValidators.cronInvalidValues', {
                    ns: 'app',
                    fieldName,
                });
            }
            if (!isValidFrequency(value)) {
                return i18n.t('fieldValidators.cronInvalidFrequency', {
                    ns: 'app',
                    fieldName,
                });
            }
            return undefined;
        }
    };
