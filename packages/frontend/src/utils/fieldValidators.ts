type FieldValidator<T> = (
    fieldName: string,
) => (value: T | undefined) => string | undefined;

export const hasNoWhiteSpaces: FieldValidator<string> =
    (fieldName) => (value) =>
        !value || value.indexOf(' ') <= 0
            ? undefined
            : `${fieldName} should not have white spaces`;

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
            const hasInvalidValues = cronValues.some(
                (item: string) => !item.match(cronValueRegex),
            );
            return hasInvalidValues
                ? `${fieldName} has invalid values. Example of valid values: "1", "1,2,3", "1-3", "*/5" and "*".`
                : undefined;
        }
    };

const VALID_EMAIL_DOMAIN_REGEX = /^[a-zA-Z0-9][\w\.-]+\.\w{2,4}/g;
export const isValidEmailDomain = (value: string) =>
    value.match(VALID_EMAIL_DOMAIN_REGEX);
