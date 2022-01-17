export const isUppercase =
    (fieldName: string) =>
    (value: string): string | undefined =>
        value === value.toUpperCase()
            ? undefined
            : `${fieldName} should be uppercase`;

export const hasNoWhiteSpaces =
    (fieldName: string) =>
    (value: string): string | undefined =>
        value.indexOf(' ') <= 0
            ? undefined
            : `${fieldName} should not have white spaces`;

export const isGitRepository =
    (fieldName: string) =>
    (value: string): string | undefined =>
        value.match(/.+\/.+/)
            ? undefined
            : `${fieldName} should match the pattern "org/project"`;

export const startWithSlash =
    (fieldName: string) =>
    (value: string): string | undefined =>
        value.match(/^\/.*/)
            ? undefined
            : `${fieldName} should start with a "/"`;
