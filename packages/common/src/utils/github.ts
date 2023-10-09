export const isGithubToken = (value: string) =>
    !!value.match(/^(github_pat_|ghp_)/);

export const validateGithubToken = (
    value: string,
): [boolean, string | undefined] => {
    if (!isGithubToken(value)) {
        return [
            false,
            `GitHub token should start with "github_pat_" or "ghp_"`,
        ];
    }
    return [true, undefined];
};
