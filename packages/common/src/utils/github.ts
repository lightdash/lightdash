export const isGithubFineGrainedToken = (value: string) =>
    !!value.match(/github_pat/);

export const isValidGithubFineGrainedToken = (value: string) =>
    !!value.match(/.*:github_pat/);

export const validateGithubToken = (
    value: string,
): [boolean, string | undefined] => {
    const isFineGrainedToken = isGithubFineGrainedToken(value);
    const isValidFineGrainedToken = isValidGithubFineGrainedToken(value);
    if (isFineGrainedToken && !isValidFineGrainedToken) {
        return [
            false,
            `Fined-grained access token should match the pattern "github_username:token". eg: rephus:github_pat_123456abc`,
        ];
    }
    return [true, undefined];
};
